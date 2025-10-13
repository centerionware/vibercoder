import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';
import { performDiff } from '../utils/diff';
import { GitFileStatus } from '../types';

// Polyfill Buffer for the worker
if (typeof self !== 'undefined' && !(self as any).Buffer) {
  (self as any).Buffer = Buffer;
}

const fs = new LightningFS('vibecode-fs');
const dir = '/';

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    let result: any;
    switch (type) {
      case 'clone':
        // Clear FS for new clone
        for (const file of await fs.promises.readdir(dir)) {
            await fs.promises.unlink(`${dir}${file}`);
        }
        await git.clone({
          fs, http, dir, corsProxy: payload.proxyUrl, url: payload.url,
          onAuth: () => ({ username: payload.token }),
          onProgress: (progress) => {
            self.postMessage({ type: 'progress', id, payload: progress });
          },
        });
        result = { success: true };
        break;
      
      case 'getHeadFiles':
        result = await getHeadFilesFromFs();
        break;

      case 'status':
        const headFiles = await getHeadFilesFromFs();
        const allFiles = new Set([...Object.keys(payload.appFiles), ...Object.keys(headFiles)]);
        const statusResult = [];
        for (const filepath of allFiles) {
            const inHead = headFiles[filepath] !== undefined;
            const inWorkspace = payload.appFiles[filepath] !== undefined;
            if (inHead && !inWorkspace) statusResult.push({ filepath, status: GitFileStatus.Deleted });
            else if (!inHead && inWorkspace) statusResult.push({ filepath, status: GitFileStatus.New });
            else if (inHead && inWorkspace && headFiles[filepath] !== payload.appFiles[filepath]) statusResult.push({ filepath, status: GitFileStatus.Modified });
        }
        result = statusResult;
        break;
      
      case 'commit':
        await writeAppFilesToFs(payload.appFiles);
        const statusMatrix = await git.statusMatrix({ fs, dir });
        for (const [filepath, head, workdir] of statusMatrix) {
            if (head !== workdir) {
                await git.add({ fs, dir, filepath });
            }
        }
        const oid = await git.commit({ fs, dir, message: payload.message, author: payload.author });
        result = { oid };
        break;
      
      case 'log':
        const commits = await git.log({ fs, dir, ref: payload.ref || 'HEAD' });
        result = commits.map(c => ({ oid: c.oid, message: c.commit.message, author: { ...c.commit.author, timestamp: c.commit.author.timestamp }, parent: c.commit.parent, }));
        break;

      case 'listBranches':
        result = await git.listBranches({ fs, dir });
        break;
      
      case 'checkout':
        await git.checkout({ fs, dir, ref: payload.branch, force: true });
        result = { files: await getHeadFilesFromFs() };
        break;

      case 'getCommitChanges':
        const commit = await git.readCommit({ fs, dir, oid: payload.oid });
        const parentOid = commit.commit.parent[0];
        const changes: any[] = [];
        if (!parentOid) { // Initial commit
            const filepaths = await git.listFiles({fs, dir, ref: payload.oid});
            for(const filepath of filepaths) {
                const content = await readFileAtCommitFromFs(payload.oid, filepath) || '';
                changes.push({ filepath, status: 'added', diff: content.split('\n').map(line => ({type: 'add', content: line})) });
            }
        } else {
            await git.walk({ fs, dir, trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: payload.oid })],
                map: async function(filepath: string, [A, B]) {
                    if (filepath === '.') return;
                    const aOid = await A?.oid(); const bOid = await B?.oid();
                    if (aOid === bOid) return;
                    let status: 'added' | 'deleted' | 'modified' = 'modified';
                    if (!aOid) status = 'added'; if (!bOid) status = 'deleted';
                    const contentA = status === 'added' ? '' : Buffer.from((await git.readBlob({ fs, dir, oid: aOid! })).blob).toString();
                    const contentB = status === 'deleted' ? '' : Buffer.from((await git.readBlob({ fs, dir, oid: bOid! })).blob).toString();
                    changes.push({ filepath, status, diff: performDiff(contentA, contentB) });
                }
            });
        }
        result = changes;
        break;
        
      case 'readFileAtCommit':
        result = await readFileAtCommitFromFs(payload.oid, payload.filepath);
        break;

      default:
        throw new Error(`Unknown command: ${type}`);
    }
    self.postMessage({ type: 'result', id, payload: result });
  } catch (error) {
    const err = error instanceof Error ? { message: error.message, stack: error.stack, name: error.name } : { message: String(error) };
    self.postMessage({ type: 'error', id, payload: err });
  }
};

// Helper functions inside worker
async function getHeadFilesFromFs(): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    try {
        const filepaths = await git.listFiles({ fs, dir });
        for (const filepath of filepaths) {
            const content = await fs.promises.readFile(`${dir}${filepath}`, 'utf8');
            files[filepath] = content as string;
        }
    } catch (e) {
      console.warn("Worker could not read files. Repository may be empty.");
    }
    return files;
}
async function writeAppFilesToFs(appFiles: Record<string, string>) {
    const promises: Promise<void>[] = [];
    for (const [filepath, content] of Object.entries(appFiles)) {
        promises.push(fs.promises.writeFile(`${dir}${filepath}`, content));
    }
    const trackedFiles = await git.listFiles({ fs, dir });
    for(const trackedFile of trackedFiles) {
        if (appFiles[trackedFile] === undefined) {
            promises.push(fs.promises.unlink(`${dir}${trackedFile}`));
        }
    }
    await Promise.all(promises);
}
async function readFileAtCommitFromFs(oid: string, filepath: string): Promise<string | null> {
    try {
        const { blob } = await git.readBlob({ fs, dir, oid, filepath });
        return Buffer.from(blob).toString('utf8');
    } catch (e) {
        return null;
    }
}

console.log('Git worker loaded.');
