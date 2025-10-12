import { isNativeEnvironment } from '../utils/environment';
import { GitService, GitAuthor, GitStatus, GitCommit, GitFileChange, GitProgress } from '../types';

const gitWorkerCode = `
// Worker scope. 'self' is the global object.
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import FS from '@isomorphic-git/lightning-fs';
import { Buffer } from 'buffer';

const fs = new FS('vibecode-git-fs');
const dir = '/';

const performDiff = (text1, text2) => {
    const lines1 = text1.split('\\n');
    const lines2 = text2.split('\\n');
    const matrix = Array(lines1.length + 1).fill(null).map(() => Array(lines2.length + 1).fill(0));

    for (let i = 1; i <= lines1.length; i++) {
        for (let j = 1; j <= lines2.length; j++) {
            if (lines1[i - 1] === lines2[j - 1]) {
                matrix[i][j] = matrix[i - 1][j - 1] + 1;
            } else {
                matrix[i][j] = Math.max(matrix[i - 1][j], matrix[i][j - 1]);
            }
        }
    }

    const diff = [];
    let i = lines1.length;
    let j = lines2.length;
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && lines1[i - 1] === lines2[j - 1]) {
            diff.unshift({ type: 'eql', content: lines1[i - 1] });
            i--; j--;
        } else if (j > 0 && (i === 0 || matrix[i][j - 1] >= matrix[i - 1][j])) {
            diff.unshift({ type: 'add', content: lines2[j - 1] });
            j--;
        } else if (i > 0 && (j === 0 || matrix[i][j - 1] < matrix[i - 1][j])) {
            diff.unshift({ type: 'del', content: lines1[i - 1] });
            i--;
        } else {
            break;
        }
    }
    return diff;
};

const readFileAtCommit = async (oid, filepath) => {
    try {
        const { blob } = await git.readBlob({ fs, dir, oid, filepath });
        return Buffer.from(blob).toString('utf8');
    } catch (e) {
        return null;
    }
};

self.onmessage = async (event) => {
    const { command, payload, id } = event.data;
    const post = (type, data) => self.postMessage({ type, id, ...data });

    try {
        let result;
        switch (command) {
            case 'clone':
                const { url, proxyUrl, author, token, isNative } = payload;
                
                // Clear the filesystem before cloning
                const entries = await fs.promises.readdir(dir);
                for (const entry of entries) {
                    await fs.promises.rm(\`/\${entry}\`, { recursive: true });
                }

                await git.clone({
                    fs,
                    http,
                    dir,
                    corsProxy: isNative ? undefined : proxyUrl,
                    url,
                    onAuth: () => ({ username: token }),
                    onProgress: (progress) => {
                        self.postMessage({ type: 'progress', id, progress });
                    }
                });
                result = { success: true };
                break;

            case 'status':
                for (const filepath in payload.appFiles) {
                    await fs.promises.writeFile(\`\${dir}\${filepath}\`, payload.appFiles[filepath], 'utf8');
                }
                const gitStatus = await git.statusMatrix({ fs, dir });
                result = gitStatus.map(([filepath, head, workdir]) => {
                    let status;
                    if (head === 0 && workdir === 2) status = 2; // New
                    else if (workdir === 0) status = 3; // Deleted
                    else if (head === 1 && workdir === 2) status = 1; // Modified
                    else status = 0; // Unmodified
                    return { filepath, status };
                }).filter(s => s.status !== 0);
                break;
            
            case 'commit':
                for (const filepath in payload.appFiles) {
                    await fs.promises.writeFile(\`\${dir}\${filepath}\`, payload.appFiles[filepath], 'utf8');
                }
                const filesToCommit = await git.statusMatrix({ fs, dir });
                for (const [filepath] of filesToCommit) {
                    await git.add({ fs, dir, filepath });
                }
                const oid = await git.commit({ fs, dir, message: payload.message, author: payload.author });
                result = { oid };
                break;
            
            case 'log':
                const commits = await git.log({ fs, dir, ref: payload.ref || 'HEAD', depth: 50 });
                result = commits.map(c => ({
                    oid: c.oid,
                    message: c.commit.message,
                    author: { ...c.commit.author },
                    parent: c.commit.parent,
                }));
                break;

            case 'listBranches':
                result = await git.listBranches({ fs, dir });
                break;
            
            case 'checkout':
                await git.checkout({ fs, dir, ref: payload.branch, force: true });
                // Return files on checkout
                const files = {};
                await git.walk({
                    fs, dir,
                    trees: [git.TREE({ ref: payload.branch })],
                    map: async (filepath, [entry]) => {
                        if (filepath === '.' || !entry) return;
                        if (await entry.type() === 'blob') {
                            const content = await readFileAtCommit(await entry.oid(), filepath);
                            if (content !== null) files[filepath] = content;
                        }
                    },
                });
                result = { files };
                break;

            case 'readFileAtCommit':
                result = await readFileAtCommit(payload.oid, payload.filepath);
                break;
            
            case 'getHeadFiles':
                 result = {};
                 try {
                    await git.walk({
                        fs, dir,
                        trees: [git.TREE({ ref: 'HEAD' })],
                        map: async (filepath, [entry]) => {
                            if (filepath === '.' || !entry) return;
                            if (await entry.type() === 'blob') {
                                const oid = await entry.oid();
                                const content = await readFileAtCommit(oid, filepath);
                                if (content !== null) result[filepath] = content;
                            }
                        },
                    });
                } catch (e) { /* an empty repo will throw */ }
                break;
            
            case 'getCommitChanges':
                const commit = await git.readCommit({ fs, dir, oid: payload.oid });
                const parentOid = commit.commit.parent[0];
                const changes = [];
                if (!parentOid) { // Initial commit
                    await git.walk({
                        fs, dir, trees: [git.TREE({ ref: payload.oid })],
                        map: async (filepath, [entry]) => {
                            if (filepath === '.') return;
                            const content = await readFileAtCommit(await entry.oid(), filepath) || '';
                            changes.push({ filepath, status: 'added', diff: performDiff('', content) });
                        }
                    });
                } else {
                     await git.walk({
                      fs, dir,
                      trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: payload.oid })],
                      map: async (filepath, [A, B]) => {
                        if (filepath === '.' || (!A && !B)) return;
                        const Aoid = await A?.oid();
                        const Boid = await B?.oid();
                        if (Aoid === Boid) return;

                        const contentA = Aoid ? await readFileAtCommit(Aoid, filepath) : '';
                        const contentB = Boid ? await readFileAtCommit(Boid, filepath) : '';

                        let status = 'modified';
                        if (!Aoid) status = 'added';
                        if (!Boid) status = 'deleted';

                        changes.push({ filepath, status, diff: performDiff(contentA, contentB) });
                      },
                    });
                }
                result = changes;
                break;

            default:
                throw new Error(\`Unknown command: \${command}\`);
        }
        post('success', { result });
    } catch (e) {
        post('error', { error: { message: e.message, stack: e.stack, ...e } });
    }
};
`;

let worker: Worker | null = null;
const pendingRequests = new Map<string, { resolve: (value: any) => void, reject: (reason?: any) => void, onProgress?: (progress: GitProgress) => void }>();
let requestIdCounter = 0;

const getWorker = (): Worker => {
    if (!worker) {
        try {
            const blob = new Blob([gitWorkerCode], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            worker = new Worker(workerUrl, { type: 'module' });

            worker.onmessage = (event) => {
                const { type, id, result, error, progress } = event.data;
                const request = pendingRequests.get(id);
                if (!request) return;

                if (type === 'progress') {
                    if (request.onProgress) {
                        request.onProgress(progress);
                    }
                    return; // Don't resolve or delete yet
                }

                if (type === 'success') {
                    request.resolve(result);
                } else if (type === 'error') {
                    const err = new Error(error.message);
                    Object.assign(err, error);
                    request.reject(err);
                }
                pendingRequests.delete(id);
            };
            worker.onerror = (event) => {
                console.error("Git Worker Error:", event);
                pendingRequests.forEach(p => p.reject(new Error("Git worker terminated unexpectedly.")));
                pendingRequests.clear();
            };
        } catch (e) {
            console.error("Failed to create Git worker:", e);
            worker = null;
        }
    }
    return worker as Worker;
};

const sendCommand = (command: string, payload: any, onProgress?: (progress: GitProgress) => void): Promise<any> => {
    return new Promise((resolve, reject) => {
        const activeWorker = getWorker();
        if (!activeWorker) {
            return reject(new Error("Git worker is not available."));
        }
        const id = `git-request-${requestIdCounter++}`;
        pendingRequests.set(id, { resolve, reject, onProgress });
        activeWorker.postMessage({ command, payload, id });
    });
};

const realGitService: GitService = {
  isReal: true,

  clone(url, proxyUrl, author, token, onProgress) {
    const isNative = isNativeEnvironment();
    return sendCommand('clone', { url, proxyUrl, author, token, isNative }, onProgress) as Promise<void>;
  },

  async status(appFiles, changedFilePaths) {
    const statuses = await sendCommand('status', { appFiles });
    return statuses.map((s: any) => ({ ...s, status: s.status }));
  },

  commit(message, author, appFiles) {
    return sendCommand('commit', { message, author, appFiles });
  },

  log(ref = 'HEAD') {
    return sendCommand('log', { ref });
  },

  listBranches() {
    return sendCommand('listBranches', {});
  },

  checkout(branch: string) {
    return sendCommand('checkout', { branch });
  },

  readFileAtCommit(oid: string, filepath: string) {
    return sendCommand('readFileAtCommit', { oid, filepath });
  },

  getCommitChanges(oid: string) {
    return sendCommand('getCommitChanges', { oid });
  },
  
  getHeadFiles() {
    return sendCommand('getHeadFiles', {});
  }
};

const mockGitService: GitService = {
  isReal: false,
  async clone(url, proxy, author, token, onProgress) {
    if (onProgress) {
        onProgress({ phase: 'Cloning (mock)', loaded: 50, total: 100 });
        await new Promise(res => setTimeout(res, 750));
        onProgress({ phase: 'Finished (mock)', loaded: 100, total: 100 });
    }
    await new Promise(res => setTimeout(res, 500));
  },
  async status(files, changedFilePaths = []) {
    return changedFilePaths.map(filepath => ({
      filepath,
      status: 1, // Modified
    }));
  },
  async commit(message) {
    await new Promise(res => setTimeout(res, 1000));
    return { oid: 'mock-commit-sha' };
  },
  async log() {
    return [
        { oid: 'abc1234', message: 'feat: Implement new UI\\n\\nMore details about this great feature.', author: { name: 'Vibe Coder', email: 'vibecoder@example.com', timestamp: Date.now() / 1000 }, parent: ['def5678'] },
        { oid: 'def5678', message: 'fix: Correct login bug', author: { name: 'Vibe Coder', email: 'vibecoder@example.com', timestamp: Date.now() / 1000 - 3600 }, parent: ['ghi9012'] },
    ];
  },
  async listBranches() { return ['main', 'develop']; },
  async checkout(branch) { 
      alert(`Switched to mock branch "${branch}"`); 
      return { files: {} };
  },
  async getCommitChanges(oid) {
    return [
        { filepath: 'index.tsx', status: 'modified', diff: [{type: 'del', content: '- old line'}, {type: 'add', content: '+ new line'}, {type: 'eql', content: 'same line'}] },
        { filepath: 'new-file.css', status: 'added', diff: [{type: 'add', content: '+ body { color: red; }' }] }
    ];
  },
  async readFileAtCommit(oid, filepath) { return `/* Content of ${filepath} at commit ${oid} */`; },
  async getHeadFiles() {
    return Promise.resolve({
        'index.html': `<html><body>Mock HEAD</body></html>`,
        'index.tsx': `console.log("Mock HEAD");`,
    });
  },
};

export const createGitService = (isReal: boolean): GitService => {
  return isReal ? realGitService : mockGitService;
};