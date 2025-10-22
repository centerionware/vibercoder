import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';
import { performDiff } from '../utils/diff';
import { GitFileStatus, GitFileChange, GitAuthor, GitStatus } from '../types';

if (typeof self !== 'undefined' && !(self as any).Buffer) {
  (self as any).Buffer = Buffer;
}

if (typeof self !== 'undefined' && !('global' in self)) {
  (self as any).global = self;
}

let fs: any = null;
const dir = '/';

async function rmrf(filepath: string): Promise<void> {
    let stat;
    try {
        stat = await fs.promises.stat(filepath);
    } catch (err) {
        if (err.code === 'ENOENT') return; // File doesn't exist, we're done.
        throw err;
    }

    if (stat.isDirectory()) {
        const files = await fs.promises.readdir(filepath);
        await Promise.all(
            files.map((file: string) => {
                const childPath = filepath === '/' ? `/${file}` : `${filepath}/${file}`;
                return rmrf(childPath);
            })
        );
        await fs.promises.rmdir(filepath);
    } else {
        await fs.promises.unlink(filepath);
    }
}

async function clearFs(): Promise<void> {
    const filesInRoot = await fs.promises.readdir('/');
    for (const file of filesInRoot) {
        // We call rmrf on the path starting with a slash
        await rmrf(`/${file}`);
    }
}

// This is a proxy function. The actual `getGitAuth` lives on the main thread.
// The main thread will pass the *result* of its `getGitAuth` call with each command.
const getAuthFromPayload = (payload: any): { token: string | undefined; author: GitAuthor; proxyUrl: string; } => {
    if (!payload.auth) {
        throw new Error(`Authentication details not provided for Git operation.`);
    }
    return payload.auth;
}

self.onmessage = async (event: MessageEvent) => {
  const { id, type, payload } = event.data;

  try {
    if (type === 'init') {
        const { projectId } = payload;
        if (!projectId) {
            throw new Error("Initialization error: projectId is missing.");
        }
        fs = new LightningFS(`aide-fs-worker-${projectId}`);
        self.postMessage({ type: 'result', id, payload: { success: true } });
        return;
    }

    if (!fs) {
        throw new Error("Git worker has not been initialized. Please send an 'init' message with a projectId first.");
    }
    
    let result: any;
    switch (type) {
      case 'clone':
        const cloneAuth = getAuthFromPayload(payload);
        await clearFs();

        await git.clone({
          fs, http, dir, corsProxy: cloneAuth.proxyUrl, url: payload.url,
          onAuth: () => ({ username: cloneAuth.token }),
          onProgress: (progress) => {
            self.postMessage({ type: 'progress', id, payload: progress });
          },
        });
        const clonedFiles = await getWorkingDirFilesFromFs();
        result = { files: clonedFiles };
        break;
      
      case 'getHeadFiles':
        result = await getHeadFilesFromFs();
        break;

      case 'status':
        result = await getStatusFromFs(payload.appFiles);
        break;
      
      case 'commit':
        const commitAuth = getAuthFromPayload(payload);
        await writeAppFilesToFs(payload.appFiles);
        const statusMatrix = await git.statusMatrix({ fs, dir, filter: f => !f.startsWith('.git/') });
        for (const [filepath, head, workdir] of statusMatrix) {
             if (workdir === 0) {
                await git.remove({ fs, dir, filepath });
            } else if (workdir === 2 || (workdir as number) === 3) {
                await git.add({ fs, dir, filepath });
            }
        }
        const oid = await git.commit({ fs, dir, message: payload.message, author: commitAuth.author });
        const postCommitStatus = await getStatusFromFs(payload.appFiles);
        result = { oid, status: postCommitStatus };
        break;
      
      case 'log':
        try {
            const commits = await git.log({ fs, dir, ref: payload.ref || 'HEAD' });
            result = commits.map(c => ({ oid: c.oid, message: c.commit.message, author: { ...c.commit.author, timestamp: c.commit.author.timestamp }, parent: c.commit.parent, }));
        } catch (e: any) {
            // FIX: Gracefully handle empty repositories. If `git.log` fails with a NotFoundError, it likely means no commits or branches exist yet. Return an empty array, which is the correct state.
            if (e.name === 'NotFoundError' || e.code === 'NotFoundError') {
                console.warn(`git.log failed, likely an empty repo: ${e.message}`);
                result = []; // Return empty array for empty/new repo
            } else {
                throw e; // Re-throw other unexpected errors
            }
        }
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

                    // FIX: Check entry type. Skip trees to prevent 'readBlob' errors.
                    const typeA = await A?.type();
                    const typeB = await B?.type();
                    if (typeA === 'tree' || typeB === 'tree') {
                        return; // This entry is a directory, not a file. Skip it.
                    }

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
        const pushAuth = getAuthFromPayload(payload);
        const branch = await git.currentBranch({ fs, dir });
        if (!branch) {
            throw new Error("Cannot push: Not currently on a branch.");
        }
        result = await git.push({
            fs, http, dir, corsProxy: pushAuth.proxyUrl,
            ref: branch,
            onAuth: () => ({ username: pushAuth.token }),
            onProgress: (progress) => {
                self.postMessage({ type: 'progress', id, payload: progress });
            }
        });
        break;
      
      case 'pull':
        const pullAuth = getAuthFromPayload(payload);
        const currentBranch = await git.currentBranch({ fs, dir });
        if (!currentBranch) {
          throw new Error("Not on a branch, cannot pull. Please checkout a branch first.");
        }
        await git.pull({
            fs, http, dir, corsProxy: pullAuth.proxyUrl,
            onAuth: () => ({ username: pullAuth.token }),
            author: pullAuth.author,
            ref: currentBranch,
            singleBranch: true,
            rebase: payload.rebase,
            onProgress: (progress) => {
                self.postMessage({ type: 'progress', id, payload: progress });
            }
        } as any);
        const postPullFiles = await getWorkingDirFilesFromFs();
        const postPullStatus = await getStatusFromFs(postPullFiles);
        result = { files: postPullFiles, status: postPullStatus };
        break;

      case 'rebase':
        const rebaseAuth = getAuthFromPayload(payload);
        await (git as any).rebase({
            fs, dir,
            branch: payload.branch,
            author: rebaseAuth.author
        });
        const postRebaseFiles = await getWorkingDirFilesFromFs();
        const postRebaseStatus = await getStatusFromFs(postRebaseFiles);
        result = { files: postRebaseFiles, status: postRebaseStatus };
        break;

      case 'getWorkingDirFiles':
        result = await getWorkingDirFilesFromFs();
        break;

      case 'writeFile':
        await fs.promises.writeFile(`${dir}${payload.filepath}`, payload.content);
        result = { success: true };
        break;

      case 'removeFile':
        await fs.promises.unlink(`${dir}${payload.filepath}`);
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

async function recursiveReadDir(currentPath: string): Promise<string[]> {
    let files: string[] = [];
    const entries = await fs.promises.readdir(currentPath);
    for (const entry of entries) {
        if (entry === '.git') continue; // Skip .git directory
        const entryPath = `${currentPath === '/' ? '' : currentPath}/${entry}`;
        const stat = await fs.promises.stat(entryPath);
        if (stat.isDirectory()) {
            files = files.concat(await recursiveReadDir(entryPath));
        } else {
            files.push(entryPath.startsWith('/') ? entryPath.substring(1) : entryPath);
        }
    }
    return files;
}

async function getHeadFilesFromFs(): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    try {
        const oid = await git.resolveRef({ fs, dir, ref: 'HEAD' });
        const filepaths = await git.listFiles({ fs, dir, ref: 'HEAD' });
        for (const filepath of filepaths) {
            try {
                const { blob } = await git.readBlob({ fs, dir, oid, filepath });
                files[filepath] = Buffer.from(blob).toString('utf8');
            } catch(e) { /* ignore read errors for non-files like submodules */ }
        }
    } catch (e) {
      console.warn("Worker could not read files. Repository may be empty.");
    }
    return files;
}

async function getWorkingDirFilesFromFs(): Promise<Record<string, string>> {
    const files: Record<string, string> = {};
    try {
        const filepaths = await recursiveReadDir(dir);
        for (const filepath of filepaths) {
            try {
                const content = await fs.promises.readFile(`/${filepath}`, 'utf8');
                files[filepath] = content as string;
            } catch (e) { /* ignore read errors for non-files like submodules */ }
        }
    } catch (e) {
        console.warn("Worker could not read working directory files. Repository may be empty.");
    }
    return files;
}

async function writeAppFilesToFs(appFiles: Record<string, string>) {
    const promises: Promise<void>[] = [];
    const trackedFiles = await git.listFiles({ fs, dir }).catch(() => []);

    for (const trackedFile of trackedFiles) {
        if (appFiles[trackedFile] === undefined) {
            promises.push(fs.promises.unlink(`${dir}${trackedFile}`));
        }
    }

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
        return null;
    }
}

async function getStatusFromFs(appFiles: Record<string, string>): Promise<GitStatus[]> {
    const headFiles = await getHeadFilesFromFs();
    const allFiles = new Set([...Object.keys(appFiles), ...Object.keys(headFiles)]);
    const statusResult: GitStatus[] = [];
    for (const filepath of allFiles) {
        const inHead = headFiles[filepath] !== undefined;
        const inWorkspace = appFiles[filepath] !== undefined;

        if (inHead && !inWorkspace) statusResult.push({ filepath, status: GitFileStatus.Deleted });
        else if (!inHead && inWorkspace) statusResult.push({ filepath, status: GitFileStatus.New });
        else if (inHead && inWorkspace && headFiles[filepath] !== appFiles[filepath]) statusResult.push({ filepath, status: GitFileStatus.Modified });
    }
    return statusResult;
}


console.log('Git worker loaded.');