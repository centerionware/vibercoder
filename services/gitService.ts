import { v4 as uuidv4 } from 'uuid';
import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { performDiff } from '../utils/diff';
import {
  GitService, GitStatus, GitCommit, GitAuthor,
  GitFileChange, GitProgress, GitFileStatus
} from '../types';
import { Buffer } from 'buffer';

// Helper for recursive reading in LightningFS
async function recursiveReadDir(fs: any, currentPath: string): Promise<string[]> {
    let files: string[] = [];
    const entries = await fs.promises.readdir(currentPath);
    for (const entry of entries) {
        if (entry === '.git') continue; // Skip the .git directory
        // LightningFS doesn't have a robust path join, so we handle it manually
        const entryPath = `${currentPath === '/' ? '' : currentPath}/${entry}`;
        const stat = await fs.promises.stat(entryPath);
        if (stat.isDirectory()) {
            files = files.concat(await recursiveReadDir(fs, entryPath));
        } else {
            // Strip leading slash for consistency
            files.push(entryPath.startsWith('/') ? entryPath.substring(1) : entryPath);
        }
    }
    return files;
}

// --- Main Thread Git Service (Non-Worker) ---
// This service runs isomorphic-git directly on the main thread.
// It's used for the Electron renderer process (to access the IPC bridge)
// and as a fallback inside the preview iframe where workers cannot be spawned.
class MainThreadGitService implements GitService {
    isReal = true;
    private fs: any;
    private dir = '/';
    private http: any;
    private getAuth: (operation: 'read' | 'write') => ({ token: string | undefined; author: GitAuthor; proxyUrl: string; }) | null;

    constructor(projectId: string, getAuthCallback: (operation: 'read' | 'write') => ({ token: string | undefined; author: GitAuthor; proxyUrl: string; }) | null) {
        // Use a unique FS name to avoid collisions, especially when running inside the preview iframe.
        const fsName = `vibecode-fs-main-${window.self !== window.top ? 'iframe-' : ''}${projectId}`;
        this.fs = new LightningFS(fsName);
        this.getAuth = getAuthCallback;

        if (window.electron?.git) {
            console.log("Using Electron IPC for Git HTTP requests.");
            this.http = window.electron.git;
        } else {
            console.log("Using standard web fetch for Git HTTP requests.");
            this.http = http;
        }
    }
    
    private async clearFs() {
        for (const file of await this.fs.promises.readdir(this.dir)) {
            await (this.fs.promises as any).rm(`${this.dir}${file}`, { recursive: true, force: true });
        }
    }

    async clone(url: string, onProgress?: (progress: GitProgress) => void): Promise<{ files: Record<string, string> }> {
        const auth = this.getAuth('read');
        await this.clearFs();
        await git.clone({
            fs: this.fs,
            http: this.http,
            dir: this.dir,
            corsProxy: this.http === http ? auth?.proxyUrl : undefined,
            url,
            onAuth: () => ({ username: auth?.token }),
            onProgress,
        });
        const files = await this.getWorkingDirFiles();
        return { files };
    }

    async getHeadFiles(): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        try {
            // Get commit hash for HEAD
            const oid = await git.resolveRef({ fs: this.fs, dir: this.dir, ref: 'HEAD' });
            // List files at that commit
            const filepaths = await git.listFiles({ fs: this.fs, dir: this.dir, ref: 'HEAD' });
            for (const filepath of filepaths) {
                try {
                    // Read file content at that commit
                    const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath });
                    files[filepath] = Buffer.from(blob).toString('utf8');
                } catch (e) { /* ignore read errors for non-files like submodules */ }
            }
        } catch (e) {
            console.warn("Could not read git files. Repository may be empty.");
        }
        return files;
    }

    async status(appFiles: Record<string, string>): Promise<GitStatus[]> {
        const headFiles = await this.getHeadFiles();
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

    async commit(message: string, appFiles: Record<string, string>): Promise<{ oid: string; status: GitStatus[] }> {
        const auth = this.getAuth('write');
        if (!auth) throw new Error("Cannot commit: Git author information not configured.");
        // Write app files to the virtual FS
        const trackedFiles = await git.listFiles({ fs: this.fs, dir: this.dir }).catch(() => []);
        for (const trackedFile of trackedFiles) {
            if (appFiles[trackedFile] === undefined) await this.fs.promises.unlink(`${this.dir}${trackedFile}`);
        }
        for (const [filepath, content] of Object.entries(appFiles)) {
            await this.fs.promises.writeFile(`${this.dir}${filepath}`, content);
        }

        // Add changes to index
        const statusMatrix = await git.statusMatrix({ fs: this.fs, dir: this.dir, filter: f => !f.startsWith('.git/') });
        for (const [filepath, head, workdir] of statusMatrix) {
            if (workdir === 0) await git.remove({ fs: this.fs, dir: this.dir, filepath });
            else if (workdir === 2 || (workdir as number) === 3) {
                await git.add({ fs: this.fs, dir: this.dir, filepath });
            }
        }
        
        const oid = await git.commit({ fs: this.fs, dir: this.dir, message, author: auth.author });
        const newStatus = await this.status(appFiles);
        return { oid, status: newStatus };
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
    
    async push(onProgress?: (progress: GitProgress) => void): Promise<{ ok: boolean, error?: string }> {
        const auth = this.getAuth('write');
        if (!auth) throw new Error("Push failed: No credentials available.");
        const branch = await git.currentBranch({ fs: this.fs, dir: this.dir });
        if (!branch) {
            throw new Error("Cannot push: Not currently on a branch.");
        }
        return git.push({
            fs: this.fs,
            http: this.http,
            dir: this.dir,
            corsProxy: this.http === http ? auth.proxyUrl : undefined,
            onAuth: () => ({ username: auth.token }),
            onProgress,
            ref: branch,
        });
    }

    async pull(rebase: boolean, onProgress?: (progress: GitProgress) => void): Promise<{ files: Record<string, string>; status: GitStatus[] }> {
        const auth = this.getAuth('read'); // Pull can be anonymous for public repos
        const author = this.getAuth('write')?.author; // But merge commits need an author
        if (!author) throw new Error("Cannot pull: Git author information is not configured.");
        const branch = await git.currentBranch({ fs: this.fs, dir: this.dir });
        if (!branch) throw new Error("Not on a branch, cannot pull.");
        await git.pull({
            fs: this.fs,
            http: this.http,
            dir: this.dir,
            corsProxy: this.http === http ? auth?.proxyUrl : undefined,
            author,
            ref: branch,
            singleBranch: true,
            rebase,
            onAuth: () => ({ username: auth?.token }),
            onProgress,
        } as any);
        const newFiles = await this.getWorkingDirFiles();
        const newStatus = await this.status(newFiles);
        return { files: newFiles, status: newStatus };
    }

    async rebase(branch: string): Promise<{ files: Record<string, string>; status: GitStatus[] }> {
        const auth = this.getAuth('write');
        if (!auth) throw new Error("Cannot rebase: Git author information is not configured.");
        await (git as any).rebase({
            fs: this.fs,
            dir: this.dir,
            branch,
            author: auth.author,
        });
        const newFiles = await this.getWorkingDirFiles();
        const newStatus = await this.status(newFiles);
        return { files: newFiles, status: newStatus };
    }

    async getWorkingDirFiles(): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        try {
            const filepaths = await recursiveReadDir(this.fs, this.dir);
            for (const filepath of filepaths) {
                try {
                    const content = await this.fs.promises.readFile(`/${filepath}`, 'utf8');
                    files[filepath] = content as string;
                } catch (e) { /* ignore read errors for non-files like submodules */ }
            }
        } catch (e) {
            console.warn("Could not read working directory files. Repository may be empty.");
        }
        return files;
    }

    async writeFile(filepath: string, content: string): Promise<void> {
        await this.fs.promises.writeFile(`${this.dir}${filepath}`, content);
    }

    async removeFile(filepath: string): Promise<void> {
        await this.fs.promises.unlink(`${this.dir}${filepath}`);
    }
}


// --- Web/Capacitor Git Service (uses Web Worker) ---
class WorkerGitService implements GitService {
    isReal = true;
    private worker: Worker | null = null;
    private requests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; }> = new Map();
    private mockService = new MockGitService();
    private initPromise: Promise<void> | null = null;
    private getAuth: (operation: 'read' | 'write') => ({ token: string | undefined; author: GitAuthor; proxyUrl: string; }) | null = () => null;

    constructor(projectId: string) {
        try {
            this.worker = new Worker(new URL('./git.worker.ts', import.meta.url), { type: 'module' });
            this.worker.onmessage = this.handleWorkerMessage.bind(this);
            this.worker.onerror = (e) => {
                console.error("Git worker encountered a critical error and has been terminated.", e);
                const workerError = new Error("The Git background worker crashed or failed to initialize. Please reload the application to use Git features.");
                
                // Reject all outstanding requests
                for (const request of this.requests.values()) {
                    request.reject(workerError);
                }
                this.requests.clear();
            
                this.isReal = false;
                this.worker = null;
            };

            this.initPromise = new Promise((resolve, reject) => {
                const id = uuidv4();
                this.requests.set(id, { resolve, reject });
                this.worker!.postMessage({ id, type: 'init', payload: { projectId } });
            });
            this.initPromise.catch(err => {
                console.error("Worker initialization failed:", err);
                this.isReal = false;
                this.worker = null;
            });

        } catch (e) {
            console.warn("Could not initialize Git worker. Git functionality will be disabled in this environment.", e);
            this.isReal = false;
            this.worker = null;
        }
    }

    private handleWorkerMessage(event: MessageEvent) {
        const { id, type, payload } = event.data;
        // Progress messages are handled by a separate listener in sendCommand
        if (type === 'progress') return;

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

    private async sendCommand(type: string, payload: any, onProgress?: (progress: GitProgress) => void): Promise<any> {
        await this.initPromise;
        if (!this.worker) {
            throw new Error("Git worker is not available.");
        }

        const isWrite = ['commit', 'push', 'rebase'].includes(type);
        const operation = isWrite ? 'write' : 'read';

        const auth = this.getAuth(operation);
        const finalPayload = { ...payload, auth };

        const id = uuidv4();
        
        let progressHandler: ((event: MessageEvent) => void) | null = null;
        if (onProgress) {
            progressHandler = (event: MessageEvent) => {
                if (event.data.type === 'progress' && event.data.id === id) {
                    onProgress(event.data.payload);
                }
            };
            this.worker.addEventListener('message', progressHandler);
        }

        const promise = new Promise((resolve, reject) => {
            this.requests.set(id, { resolve, reject });
            this.worker!.postMessage({ id, type, payload: finalPayload });
        });

        // Cleanup the progress listener
        promise.finally(() => {
            if (progressHandler) {
                this.worker!.removeEventListener('message', progressHandler);
            }
        });

        return promise;
    }

    clone(url: string, onProgress?: (progress: GitProgress) => void): Promise<{ files: Record<string, string> }> {
        if (!this.worker) return this.mockService.clone(url, onProgress);
        return this.sendCommand('clone', { url }, onProgress);
    }
    getHeadFiles(): Promise<Record<string, string>> { 
        if (!this.worker) return this.mockService.getHeadFiles();
        return this.sendCommand('getHeadFiles', {}); 
    }
    status(appFiles: Record<string, string>): Promise<GitStatus[]> {
        if (!this.worker) return this.mockService.status(appFiles);
        return this.sendCommand('status', { appFiles }); 
    }
    commit(message: string, appFiles: Record<string, string>): Promise<{ oid: string; status: GitStatus[] }> { 
        if (!this.worker) return this.mockService.commit(message, appFiles);
        return this.sendCommand('commit', { message, appFiles }); 
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
    push(onProgress?: (progress: GitProgress) => void): Promise<{ ok: boolean, error?: string }> {
        if (!this.worker) return this.mockService.push(onProgress);
        return this.sendCommand('push', { }, onProgress);
    }
    pull(rebase: boolean, onProgress?: (progress: GitProgress) => void): Promise<{ files: Record<string, string>; status: GitStatus[] }> {
        if (!this.worker) return this.mockService.pull(rebase, onProgress);
        return this.sendCommand('pull', { rebase }, onProgress);
    }
    rebase(branch: string): Promise<{ files: Record<string, string>; status: GitStatus[] }> {
        if (!this.worker) return this.mockService.rebase(branch);
        return this.sendCommand('rebase', { branch });
    }
    getWorkingDirFiles(): Promise<Record<string, string>> {
        if (!this.worker) return this.mockService.getWorkingDirFiles();
        return this.sendCommand('getWorkingDirFiles', {});
    }
    writeFile(filepath: string, content: string): Promise<void> {
        if (!this.worker) return this.mockService.writeFile(filepath, content);
        return this.sendCommand('writeFile', { filepath, content });
    }
    removeFile(filepath: string): Promise<void> {
        if (!this.worker) return this.mockService.removeFile(filepath);
        return this.sendCommand('removeFile', { filepath });
    }
}


// --- Mock Git Service ---
class MockGitService implements GitService {
    isReal = false;
    async clone(url: string, onProgress?: (progress: GitProgress) => void): Promise<{ files: Record<string, string> }> { console.warn("MockGitService: clone called"); return { files: {} }; }
    async status(appFiles: Record<string, string>, changedFilePaths?: string[]): Promise<GitStatus[]> { console.warn("MockGitService: status called"); return []; }
    async commit(message: string, appFiles: Record<string, string>): Promise<{ oid: string; status: GitStatus[] }> { console.warn("MockGitService: commit called"); return { oid: 'mock_oid', status: [] }; }
    async log(ref?: string): Promise<GitCommit[]> { console.warn("MockGitService: log called"); return []; }
    async listBranches(): Promise<string[]> { console.warn("MockGitService: listBranches called"); return ['main']; }
    async checkout(branch: string): Promise<{ files: Record<string, string> }> { console.warn("MockGitService: checkout called"); return { files: {} }; }
    async getCommitChanges(oid: string): Promise<GitFileChange[]> { console.warn("MockGitService: getCommitChanges called"); return []; }
    async readFileAtCommit(oid: string, filepath: string): Promise<string | null> { console.warn("MockGitService: readFileAtCommit called"); return null; }
    async getHeadFiles(): Promise<Record<string, string>> { console.warn("MockGitService: getHeadFiles called"); return {}; }
    async push(onProgress?: (progress: GitProgress) => void): Promise<{ ok: boolean, error?: string }> { console.warn("MockGitService: push called"); return { ok: true }; }
    async pull(rebase: boolean, onProgress?: (progress: GitProgress) => void): Promise<{ files: Record<string, string>; status: GitStatus[] }> { console.warn("MockGitService: pull called"); return { files: {}, status: [] }; }
    async rebase(branch: string): Promise<{ files: Record<string, string>; status: GitStatus[] }> { console.warn("MockGitService: rebase called"); return { files: {}, status: [] }; }
    async getWorkingDirFiles(): Promise<Record<string, string>> { console.warn("MockGitService: getWorkingDirFiles called"); return {}; }
    async writeFile(filepath: string, content: string): Promise<void> { console.warn("MockGitService: writeFile called"); }
    async removeFile(filepath: string): Promise<void> { console.warn("MockGitService: removeFile called"); }
}

// --- Service Factory ---
export function createGitService(isReal: boolean, projectId: string | null, getAuthCallback?: any): GitService {
  if (!isReal || !projectId) {
    return new MockGitService();
  }
  
  const isInIframe = window.self !== window.top;

  // Use the main-thread service for Electron OR if inside the preview iframe where workers fail.
  if (window.electron?.isElectron || isInIframe) {
    console.log(`Initializing main-thread Git Service for project ${projectId}. In iframe: ${isInIframe}`);
    return new MainThreadGitService(projectId, getAuthCallback);
  }
  
  // Use the worker-based service for all other environments (web, Capacitor) for performance
  console.log(`Initializing worker-based Git Service for project ${projectId}.`);
  const workerService = new WorkerGitService(projectId);
  // Pass the auth callback to the worker. It will be passed back with every command.
  (workerService as any).getAuth = getAuthCallback;
  return workerService;
}