import { v4 as uuidv4 } from 'uuid';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { performDiff } from '../utils/diff';
import {
  GitService, GitStatus, GitCommit, GitAuthor,
  GitFileChange, GitProgress, GitFileStatus
} from '../types';
// FIX: Add import for Buffer to resolve type errors in the browser environment.
import { Buffer } from 'buffer';

// --- Electron Git Service (runs on Renderer Thread) ---
// This service runs isomorphic-git directly on the main thread because it needs
// access to the `window.electron` IPC bridge, which is not available in workers.
// The performance is acceptable for most operations except for very large clones.
class ElectronMainThreadGitService implements GitService {
    isReal = true;
    private fs: any;
    private dir = '/';
    private http: any;

    constructor() {
        this.fs = new LightningFS('vibecode-fs-electron');
        if (!window.electron?.git) {
            throw new Error("Electron Git IPC bridge is not available.");
        }
        this.http = window.electron.git; // Use the IPC proxy
    }
    
    private async clearFs() {
        for (const file of await this.fs.promises.readdir(this.dir)) {
            if (file !== '.git') {
                // FIX: Cast to `any` to bypass outdated type definitions for LightningFS, which do not include the `rm` method.
                // The method exists at runtime, so this cast resolves the TypeScript error without changing functionality.
                await (this.fs.promises as any).rm(`${this.dir}${file}`, { recursive: true, force: true });
            }
        }
    }

    async clone(url: string, proxyUrl: string, author: GitAuthor, token: string, onProgress?: (progress: GitProgress) => void): Promise<void> {
        await this.clearFs();
        await git.clone({
            fs: this.fs,
            http: this.http,
            dir: this.dir,
            url,
            onAuth: () => ({ username: token }),
            onProgress,
        });
    }

    async getHeadFiles(): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        try {
            await git.checkout({ fs: this.fs, dir: this.dir, ref: 'HEAD', force: true });
            const filepaths = await git.listFiles({ fs: this.fs, dir: this.dir });
            for (const filepath of filepaths) {
                try {
                    const content = await this.fs.promises.readFile(`${this.dir}${filepath}`, 'utf8');
                    files[filepath] = content as string;
                } catch (e) {}
            }
        } catch (e) {
            console.warn("Could not read git files. Repository may be empty.");
        }
        return files;
    }

    async status(appFiles: Record<string, string>): Promise<GitStatus[]> {
        const headFiles = await this.getHeadFiles();
        const allFiles = new Set([...Object.keys(appFiles), ...Object.keys(headFiles)]);
        const statusResult = [];
        for (const filepath of allFiles) {
            const inHead = headFiles[filepath] !== undefined;
            const inWorkspace = appFiles[filepath] !== undefined;

            if (inHead && !inWorkspace) statusResult.push({ filepath, status: GitFileStatus.Deleted });
            else if (!inHead && inWorkspace) statusResult.push({ filepath, status: GitFileStatus.New });
            else if (inHead && inWorkspace && headFiles[filepath] !== appFiles[filepath]) statusResult.push({ filepath, status: GitFileStatus.Modified });
        }
        return statusResult;
    }

    async commit(message: string, author: GitAuthor, appFiles: Record<string, string>): Promise<{ oid: string }> {
        // Write app files to the virtual FS
        const trackedFiles = await git.listFiles({ fs: this.fs, dir: this.dir }).catch(() => []);
        for (const trackedFile of trackedFiles) {
            if (appFiles[trackedFile] === undefined) await this.fs.promises.unlink(`${this.dir}${trackedFile}`);
        }
        for (const [filepath, content] of Object.entries(appFiles)) {
            await this.fs.promises.writeFile(`${this.dir}${filepath}`, content);
        }

        // Add changes to index
        const statusMatrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });
        for (const [filepath, head, workdir] of statusMatrix) {
            if (workdir === 0) await git.remove({ fs: this.fs, dir: this.dir, filepath });
            else if (workdir === 2 || (workdir as number) === 3) {
                // FIX: Cast `workdir` to `number` to resolve a TypeScript error caused by outdated type definitions.
                // The library returns `3` for new files, but the types only allow `0 | 1 | 2`, causing a comparison error.
                await git.add({ fs: this.fs, dir: this.dir, filepath });
            }
        }
        
        const oid = await git.commit({ fs: this.fs, dir: this.dir, message, author });
        return { oid };
    }

    async log(ref?: string): Promise<GitCommit[]> {
        const commits = await git.log({ fs: this.fs, dir: this.dir, ref: ref || 'HEAD' });
        return commits.map(c => ({ oid: c.oid, message: c.commit.message, author: { ...c.commit.author, timestamp: c.commit.author.timestamp }, parent: c.commit.parent }));
    }

    async listBranches(): Promise<string[]> {
       return git.listBranches({ fs: this.fs, dir: this.dir });
    }

    async checkout(branch: string): Promise<{ files: Record<string, string> }> {
        await git.checkout({ fs: this.fs, dir: this.dir, ref: branch, force: true });
        return { files: await this.getHeadFiles() };
    }
    
    async getCommitChanges(oid: string): Promise<GitFileChange[]> {
         const commit = await git.readCommit({ fs: this.fs, dir: this.dir, oid });
        const parentOid = commit.commit.parent[0];
        const changes: GitFileChange[] = [];
        if (!parentOid) {
            const filepaths = await git.listFiles({ fs: this.fs, dir: this.dir, ref: oid });
            for(const filepath of filepaths) {
                const content = await this.readFileAtCommit(oid, filepath) || '';
                changes.push({ filepath, status: 'added', diff: content.split('\n').map(line => ({type: 'add', content: line})) });
            }
        } else {
            await git.walk({ fs: this.fs, dir: this.dir, trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: oid })],
                map: async (filepath: string, [A, B]) => {
                    if (filepath === '.') return;
                    const aOid = await A?.oid(); const bOid = await B?.oid();
                    if (aOid === bOid) return;
                    let status: 'added' | 'deleted' | 'modified' = 'modified';
                    if (!aOid) status = 'added'; if (!bOid) status = 'deleted';
                    const contentA = status === 'added' ? '' : Buffer.from((await git.readBlob({ fs: this.fs, dir: this.dir, oid: aOid! })).blob).toString();
                    const contentB = status === 'deleted' ? '' : Buffer.from((await git.readBlob({ fs: this.fs, dir: this.dir, oid: bOid! })).blob).toString();
                    changes.push({ filepath, status, diff: performDiff(contentA, contentB) });
                }
            });
        }
        return changes;
    }
    
    async readFileAtCommit(oid: string, filepath: string): Promise<string | null> {
         try {
            const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath });
            return Buffer.from(blob).toString('utf8');
        } catch (e) {
            return null;
        }
    }
}


// --- Web/Capacitor Git Service (uses Web Worker) ---
class WorkerGitService implements GitService {
    isReal = true;
    private worker: Worker | null = null;
    private requests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; }> = new Map();
    private mockService = new MockGitService();

    constructor() {
        try {
            // The URL resolution for the worker can fail in some sandboxed environments.
            // This gracefully disables Git functionality instead of crashing the app.
            this.worker = new Worker(new URL('./git.worker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            this.worker.onerror = (e) => {
                console.warn("Git worker encountered an error. Git functionality will be disabled.", e);
                this.isReal = false;
                this.worker = null; // Disable the worker
            };
        } catch (e) {
            console.warn("Could not initialize Git worker. Git functionality will be disabled in this environment.", e);
            this.isReal = false;
            this.worker = null;
        }
    }

    private handleWorkerMessage(event: MessageEvent) {
        const { id, type, payload } = event.data;
        const request = this.requests.get(id);
        if (!request) return;

        if (type === 'result') {
            request.resolve(payload);
        } else if (type === 'error') {
            const error = new Error(payload.message);
            error.stack = payload.stack;
            error.name = payload.name;
            request.reject(error);
        }
        this.requests.delete(id);
    }

    private sendCommand(type: string, payload: any, onProgress?: (progress: GitProgress) => void): Promise<any> {
        return new Promise((resolve, reject) => {
            const id = uuidv4();
            this.requests.set(id, { resolve, reject });

            let progressHandler: ((event: MessageEvent) => void) | null = null;
            if (type === 'clone' && onProgress) {
                progressHandler = (event: MessageEvent) => {
                    if (event.data.type === 'progress' && event.data.id === id) {
                        onProgress(event.data.payload);
                    }
                };
                this.worker!.addEventListener('message', progressHandler);
                
                const cleanup = () => { if(progressHandler) this.worker!.removeEventListener('message', progressHandler); };
                const originalResolve = resolve;
                resolve = (value) => { cleanup(); originalResolve(value); };
                const originalReject = reject;
                reject = (reason) => { cleanup(); originalReject(reason); };
                this.requests.set(id, { resolve, reject });
            }
            
            this.worker!.postMessage({ id, type, payload });
        });
    }

    clone(url: string, proxyUrl: string, author: GitAuthor, token: string, onProgress?: (progress: GitProgress) => void): Promise<void> {
        if (!this.worker) return this.mockService.clone(url, proxyUrl, author, token, onProgress);
        return this.sendCommand('clone', { url, proxyUrl, token }, onProgress);
    }
    getHeadFiles(): Promise<Record<string, string>> { 
        if (!this.worker) return this.mockService.getHeadFiles();
        return this.sendCommand('getHeadFiles', {}); 
    }
    status(appFiles: Record<string, string>): Promise<GitStatus[]> {
        if (!this.worker) return this.mockService.status(appFiles);
        return this.sendCommand('status', { appFiles }); 
    }
    commit(message: string, author: GitAuthor, appFiles: Record<string, string>): Promise<{ oid: string }> { 
        if (!this.worker) return this.mockService.commit(message, author, appFiles);
        return this.sendCommand('commit', { message, author, appFiles }); 
    }
    log(ref?: string): Promise<GitCommit[]> { 
        if (!this.worker) return this.mockService.log(ref);
        return this.sendCommand('log', { ref }); 
    }
    listBranches(): Promise<string[]> { 
        if (!this.worker) return this.mockService.listBranches();
        return this.sendCommand('listBranches', {}); 
    }
    checkout(branch: string): Promise<{ files: Record<string, string> }> { 
        if (!this.worker) return this.mockService.checkout(branch);
        return this.sendCommand('checkout', { branch }); 
    }
    getCommitChanges(oid: string): Promise<GitFileChange[]> { 
        if (!this.worker) return this.mockService.getCommitChanges(oid);
        return this.sendCommand('getCommitChanges', { oid }); 
    }
    readFileAtCommit(oid: string, filepath: string): Promise<string | null> { 
        if (!this.worker) return this.mockService.readFileAtCommit(oid, filepath);
        return this.sendCommand('readFileAtCommit', { oid, filepath }); 
    }
}


// --- Mock Git Service ---
class MockGitService implements GitService {
    isReal = false;
    async clone(url: string, proxyUrl: string | undefined, author: GitAuthor, token: string, onProgress?: (progress: GitProgress) => void): Promise<void> { console.warn("MockGitService: clone called"); }
    async status(appFiles: Record<string, string>, changedFilePaths?: string[]): Promise<GitStatus[]> { console.warn("MockGitService: status called"); return []; }
    async commit(message: string, author: GitAuthor, appFiles: Record<string, string>): Promise<{ oid: string }> { console.warn("MockGitService: commit called"); return { oid: 'mock_oid' }; }
    async log(ref?: string): Promise<GitCommit[]> { console.warn("MockGitService: log called"); return []; }
    async listBranches(): Promise<string[]> { console.warn("MockGitService: listBranches called"); return ['main']; }
    async checkout(branch: string): Promise<{ files: Record<string, string> }> { console.warn("MockGitService: checkout called"); return { files: {} }; }
    async getCommitChanges(oid: string): Promise<GitFileChange[]> { console.warn("MockGitService: getCommitChanges called"); return []; }
    async readFileAtCommit(oid: string, filepath: string): Promise<string | null> { console.warn("MockGitService: readFileAtCommit called"); return null; }
    async getHeadFiles(): Promise<Record<string, string>> { console.warn("MockGitService: getHeadFiles called"); return {}; }
}

// --- Service Factory ---
export function createGitService(isReal: boolean, projectId: string | null): GitService {
  if (!isReal || !projectId) { // projectId is not used here but kept for API consistency
    return new MockGitService();
  }

  // Use the main-thread service for Electron to access the IPC bridge
  if (window.electron?.isElectron) {
    console.log("Initializing main-thread Electron Git Service.");
    return new ElectronMainThreadGitService();
  }
  
  // Use the worker-based service for all other environments (web, Capacitor) for performance
  console.log("Initializing worker-based Git Service for web/Capacitor.");
  return new WorkerGitService();
}