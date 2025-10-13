import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';
import { performDiff } from '../utils/diff';
import { GitFileStatus, GitFileChange } from '../types';

if (typeof self !== 'undefined' && !(self as any).Buffer) {
  (self as any).Buffer = Buffer;
}

// Vite's top-level `define` config sets `global` to `window`, which is incorrect for workers.
// This polyfills 'global' for libraries that expect it in a worker context.
if (typeof self !== 'undefined' && !('global' in self)) {
  (self as any).global = self;
}

let fs: any = null;
const dir = '/';

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'init') {
        const { projectId } = payload;
        if (!projectId) {
            throw new Error("Initialization error: projectId is missing.");
        }
        fs = new LightningFS(`vibecode-fs-${projectId}`);
        self.postMessage({ type: 'result', id, payload: { success: true } });
        return;
    }

    if (!fs) {
        throw new Error("Git worker has not been initialized. Please send an 'init' message with a projectId first.");
    }
    
    let result: any;
    switch (type) {
      case 'clone':
        // Nuke the entire FS for this project before cloning
        const filesInRoot = await fs.promises.readdir(dir);
        for (const file of filesInRoot) {
            await (fs.promises as any).rm(`${dir}${file}`, { recursive: true, force: true });
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
        // Add all changed files to the index before committing
        const statusMatrix = await git.statusMatrix({ fs, dir });
        for (const [filepath, head, workdir] of statusMatrix) {
             if (workdir === 0) { // Deleted
                await git.remove({ fs, dir, filepath });
            } else if (workdir === 2 || (workdir as number) === 3) { // New or Modified
                // FIX: Cast `workdir` to `number` to resolve a TypeScript error caused by outdated type definitions.
                // The library returns `3` for new files, but the types only allow `0 | 1 | 2`, causing a comparison error.
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
        const localBranches = await git.listBranches({ fs, dir });
        const remoteBranches = await git.listBranches({ fs, dir, remote: 'origin' });
        result = [...new Set([...localBranches, ...remoteBranches])];
        break;
      
      case 'checkout':
        await git.checkout({ fs, dir, ref: payload.branch, force: true });
        result = { files: await getHeadFilesFromFs() };
        break;

      case 'getCommitChanges':
        const commit = await git.readCommit({ fs, dir, oid: payload.oid });
        const parentOid = commit.commit.parent[0];
        const changes: GitFileChange[] = [];
        const MAX_DIFF_SIZE = 200 * 1024; // 200KB

        if (!parentOid) { // This is the initial commit
            const filepaths = await git.listFiles({fs, dir, ref: payload.oid});
            for(const filepath of filepaths) {
                const change: GitFileChange = { filepath, status: 'added' };
                const blobResult = await git.readBlob({ fs, dir, oid: payload.oid, filepath });

                if (blobResult.blob.byteLength > MAX_DIFF_SIZE) {
                    change.isTooLarge = true;
                } else if (Buffer.from(blobResult.blob.slice(0, 8000)).includes(0)) {
                    change.isBinary = true;
                } else {
                    const content = Buffer.from(blobResult.blob).toString();
                    change.diff = content.split('\n').map(line => ({type: 'add', content: line}));
                }
                changes.push(change);
            }
        } else {
            await git.walk({ fs, dir, trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: payload.oid })],
                map: async function(filepath: string, [A, B]) {
                    if (filepath === '.') return;
                    const aOid = await A?.oid(); const bOid = await B?.oid();
                    if (aOid === bOid) return; // Unchanged

                    let status: 'added' | 'deleted' | 'modified' = 'modified';
                    if (!aOid) status = 'added'; if (!bOid) status = 'deleted';
                    
                    const change: GitFileChange = { filepath, status };
                    const blobForCheckOid = status === 'added' ? bOid : (bOid || aOid);

                    if (blobForCheckOid) {
                        const { blob } = await git.readBlob({fs, dir, oid: blobForCheckOid});
                         if (blob.byteLength > MAX_DIFF_SIZE) {
                            change.isTooLarge = true;
                        } else if (Buffer.from(blob.slice(0, 8000)).includes(0)) {
                            change.isBinary = true;
                        }
                    }

                    if (change.isTooLarge || change.isBinary) {
                        changes.push(change);
                        return;
                    }

                    const contentA = status === 'added' ? '' : Buffer.from((await git.readBlob({ fs, dir, oid: aOid! })).blob).toString();
                    const contentB = status === 'deleted' ? '' : Buffer.from((await git.readBlob({ fs, dir, oid: bOid! })).blob).toString();
                    change.diff = performDiff(contentA, contentB);
                    changes.push(change);
                }
            });
        }
        result = changes;
        break;
        
      case 'readFileAtCommit':
        result = await readFileAtCommitFromFs(payload.oid, payload.filepath);
        break;
        
      case 'push':
        result = await git.push({
            fs, http, dir, corsProxy: payload.proxyUrl,
            onAuth: () => ({ username: payload.token }),
            onProgress: (progress) => {
                self.postMessage({ type: 'progress', id, payload: progress });
            }
        });
        break;
      
      case 'pull':
        const currentBranch = await git.currentBranch({ fs, dir });
        // FIX: Added a check to ensure a branch is checked out before pulling, preventing a runtime error.
        // The `ref` property requires a string, but `currentBranch` can be undefined.
        if (!currentBranch) {
          throw new Error("Not on a branch, cannot pull. Please checkout a branch first.");
        }
        await git.pull({
            fs, http, dir, corsProxy: payload.proxyUrl,
            onAuth: () => ({ username: payload.token }),
            author: payload.author,
            ref: currentBranch,
            singleBranch: true,
            rebase: payload.rebase,
            onProgress: (progress) => {
                self.postMessage({ type: 'progress', id, payload: progress });
            }
        });
        result = { success: true };
        break;

      case 'rebase':
        // FIX: Cast 'git' to 'any' to call the 'rebase' method. This bypasses outdated type definitions
        // where 'rebase' is not recognized as a valid function on the main git object.
        await (git as any).rebase({
            fs, dir,
            branch: payload.branch,
            author: payload.author
        });
        result = { success: true };
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

// --- Helper functions ---
async function getHeadFilesFromFs(): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    try {
        await git.checkout({ fs, dir, ref: 'HEAD', force: true });
        const filepaths = await git.listFiles({ fs, dir });
        for (const filepath of filepaths) {
            try {
                const content = await fs.promises.readFile(`${dir}${filepath}`, 'utf8');
                files[filepath] = content as string;
            } catch(e) { /* ignore read errors for non-files like submodules */ }
        }
    } catch (e) {
      console.warn("Worker could not read files. Repository may be empty.");
    }
    return files;
}

async function writeAppFilesToFs(appFiles: Record<string, string>) {
    const promises: Promise<void>[] = [];
    const trackedFiles = await git.listFiles({ fs, dir }).catch(() => []);

    // Delete files that are in git but not in the app state
    for (const trackedFile of trackedFiles) {
        if (appFiles[trackedFile] === undefined) {
            promises.push(fs.promises.unlink(`${dir}${trackedFile}`));
        }
    }

    // Write all app files to the virtual file system
    for (const [filepath, content] of Object.entries(appFiles)) {
        promises.push(fs.promises.writeFile(`${dir}${filepath}`, content));
    }
    await Promise.all(promises);
}

async function readFileAtCommitFromFs(oid: string, filepath: string): Promise<string | null> {
    try {
        const { blob } = await git.readBlob({ fs, dir, oid, filepath });
        return Buffer.from(blob).toString('utf8');
    } catch (e) {
        // This can happen if the file doesn't exist at that commit, which is normal.
        return null;
    }
}

console.log('Git worker loaded.');