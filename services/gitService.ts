import git from 'isomorphic-git';
// Import the web http client for Capacitor
import http from 'isomorphic-git/http/web';
import LightningFS from '@isomorphic-git/lightning-fs';
import { v4 as uuidv4 } from 'uuid';
import { Buffer } from 'buffer';
// Import Capacitor for the environment check
import { Capacitor } from '@capacitor/core';

import {
  GitService, GitStatus, GitCommit, GitAuthor,
  GitFileChange, GitProgress, GitFileStatus
} from '../types';
import { performDiff } from '../utils/diff';

// --- Web Worker Git Service ---
// This service runs isomorphic-git in a Web Worker to offload heavy processing
// from the main UI thread. It's used for the standard web version of the app.
class WorkerGitService implements GitService {
    isReal = true;
    private worker: Worker;
    private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; }>;
    private progressListeners: Map<string, (progress: GitProgress) => void>;

    constructor() {
        this.worker = new Worker(new URL('./git.worker.ts', import.meta.url), { type: 'module' });
        this.pendingRequests = new Map();
        this.progressListeners = new Map();

        this.worker.onmessage = async (event) => {
            const { type, id, payload } = event.data;
            
            if (type === 'progress') {
                const listener = this.progressListeners.get(id);
                listener?.(payload);
                return;
            }

            const pending = this.pendingRequests.get(id);
            if (!pending) return;

            if (type === 'result') {
                pending.resolve(payload);
            } else if (type === 'error') {
                const err = new Error(payload.message);
                err.stack = payload.stack;
                err.name = payload.name;
                pending.reject(err);
            }
            this.pendingRequests.delete(id);
            this.progressListeners.delete(id);
        };

        this.worker.onerror = (event) => {
            console.error("Git Worker Error:", event);
            const error = new Error('Git worker terminated unexpectedly.');
            for (const [id, pending] of this.pendingRequests.entries()) {
                pending.reject(error);
                this.pendingRequests.delete(id);
                this.progressListeners.delete(id);
            }
        };
    }

    private postMessage<T>(id: string, type: string, payload: any): Promise<T> {
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.worker.postMessage({ id, type, payload });
        });
    }

    async clone(url: string, proxyUrl: string | undefined, author: GitAuthor, token: string, onProgress?: (progress: GitProgress) => void): Promise<void> {
        const id = uuidv4();
        if (onProgress) {
            this.progressListeners.set(id, onProgress);
        }
        return this.postMessage(id, 'clone', { url, proxyUrl, token });
    }

    async getHeadFiles(): Promise<Record<string, string>> {
        const id = uuidv4();
        return this.postMessage(id, 'getHeadFiles', {});
    }
    
    async status(appFiles: Record<string, string>): Promise<GitStatus[]> {
        const id = uuidv4();
        return this.postMessage(id, 'status', { appFiles });
    }

    async commit(message: string, author: GitAuthor, appFiles: Record<string, string>): Promise<{ oid: string }> {
        const id = uuidv4();
        return this.postMessage(id, 'commit', { message, author, appFiles });
    }

    async log(ref?: string): Promise<GitCommit[]> {
        const id = uuidv4();
        return this.postMessage(id, 'log', { ref });
    }

    async listBranches(): Promise<string[]> {
        const id = uuidv4();
        return this.postMessage(id, 'listBranches', {});
    }

    async checkout(branch: string): Promise<{ files: Record<string, string> }> {
        const id = uuidv4();
        return this.postMessage(id, 'checkout', { branch });
    }

    async getCommitChanges(oid: string): Promise<GitFileChange[]> {
        const id = uuidv4();
        return this.postMessage(id, 'getCommitChanges', { oid });
    }
    
    async readFileAtCommit(oid: string, filepath: string): Promise<string | null> {
        const id = uuidv4();
        return this.postMessage(id, 'readFileAtCommit', { oid, filepath });
    }
}


// --- Electron Git Service ---
// This service runs isomorphic-git in the renderer process and uses the
// Electron main process for HTTP requests to bypass CORS.

const electronHttp = {
  async request(options: any) {
    if (!window.electron?.gitHttpRequest) {
      throw new Error('Electron IPC bridge for Git is not available.');
    }
    const bodyParts: Uint8Array[] = [];
    if (options.body) {
      for await (const chunk of options.body) {
        bodyParts.push(chunk);
      }
    }
    
    const response = await window.electron.gitHttpRequest({ ...options, body: bodyParts });
    
    const bodyIterable = (async function*() {
      if (response.body && response.body.type === 'Buffer' && Array.isArray(response.body.data)) {
         yield new Uint8Array(response.body.data);
      } else if (response.body) {
        yield response.body;
      }
    })();

    return { ...response, body: bodyIterable };
  }
};

class ElectronGitService implements GitService {
    isReal = true;
    private fs = new LightningFS('vibecode-fs');
    private dir = '/';

    private async clearFs() {
        for (const file of await this.fs.promises.readdir(this.dir)) {
            await this.fs.promises.unlink(`${this.dir}${file}`);
        }
    }

    private async getHeadFilesFromFs(): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        try {
            await git.checkout({ fs: this.fs, dir: this.dir, ref: 'HEAD', force: true });
            const filepaths = await git.listFiles({ fs: this.fs, dir: this.dir });
            for (const filepath of filepaths) {
                try {
                    const content = await this.fs.promises.readFile(`${this.dir}${filepath}`, 'utf8');
                    files[filepath] = content as string;
                } catch(e) { /* ignore read errors */ }
            }
        } catch (e) { console.warn("Could not read files from HEAD. Repository may be empty."); }
        return files;
    }

    private async writeAppFilesToFs(appFiles: Record<string, string>) {
        const promises: Promise<void>[] = [];
        const trackedFiles = await git.listFiles({ fs: this.fs, dir: this.dir });

        for (const trackedFile of trackedFiles) {
            if (appFiles[trackedFile] === undefined) {
                promises.push(this.fs.promises.unlink(`${this.dir}${trackedFile}`));
            }
        }

        for (const [filepath, content] of Object.entries(appFiles)) {
            promises.push(this.fs.promises.writeFile(`${this.dir}${filepath}`, content));
        }
        await Promise.all(promises);
    }
    
    private async readFileAtCommitFromFs(oid: string, filepath: string): Promise<string | null> {
        try {
            const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath });
            return Buffer.from(blob).toString('utf8');
        } catch (e) {
            return null;
        }
    }
    
    async clone(url: string, proxyUrl: string | undefined, author: GitAuthor, token: string, onProgress?: (progress: GitProgress) => void): Promise<void> {
        await this.clearFs();
        await git.clone({
          fs: this.fs, http: electronHttp, dir: this.dir, url: url,
          onAuth: () => ({ username: token }),
          onProgress,
        });
    }
    
    async getHeadFiles(): Promise<Record<string, string>> {
        return this.getHeadFilesFromFs();
    }
    
    async status(appFiles: Record<string, string>): Promise<GitStatus[]> {
        const headFiles = await this.getHeadFilesFromFs();
        const allFilepaths = new Set([...Object.keys(appFiles), ...Object.keys(headFiles)]);
        const statusResult: GitStatus[] = [];
        for (const filepath of allFilepaths) {
            const inHead = headFiles[filepath] !== undefined;
            const inWorkspace = appFiles[filepath] !== undefined;
            if (inHead && !inWorkspace) statusResult.push({ filepath, status: GitFileStatus.Deleted });
            else if (!inHead && inWorkspace) statusResult.push({ filepath, status: GitFileStatus.New });
            else if (inHead && inWorkspace && headFiles[filepath] !== appFiles[filepath]) statusResult.push({ filepath, status: GitFileStatus.Modified });
        }
        return statusResult;
    }
    
    async commit(message: string, author: GitAuthor, appFiles: Record<string, string>): Promise<{ oid: string }> {
        await this.writeAppFilesToFs(appFiles);
        // Stage all changes, which is simpler and more robust than trying to be surgical.
        const filepaths = new Set(await git.listFiles({ fs: this.fs, dir: this.dir }));
        const matrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });
        for (const [filepath, head, workdir] of matrix) {
            if (head === 0 && workdir > 0) filepaths.add(filepath); // Track new untracked files
        }
        
        for (const filepath of filepaths) {
            const status = await git.status({ fs: this.fs, dir: this.dir, filepath });
            if (status.includes('deleted')) {
                await git.remove({ fs: this.fs, dir: this.dir, filepath });
            } else if (status !== 'unmodified' && status !== 'absent') {
                await git.add({ fs: this.fs, dir: this.dir, filepath });
            }
        }
        
        const oid = await git.commit({ fs: this.fs, dir: this.dir, message, author });
        return { oid };
    }

    async log(ref?: string): Promise<GitCommit[]> {
        const commits = await git.log({ fs: this.fs, dir: this.dir, ref: ref || 'HEAD' });
        return commits.map(c => ({ oid: c.oid, message: c.commit.message, author: { ...c.commit.author, timestamp: c.commit.author.timestamp }, parent: c.commit.parent, }));
    }

    async listBranches(): Promise<string[]> {
        return await git.listBranches({ fs: this.fs, dir: this.dir });
    }

    async checkout(branch: string): Promise<{ files: Record<string, string> }> {
        await git.checkout({ fs: this.fs, dir: this.dir, ref: branch, force: true });
        return { files: await this.getHeadFilesFromFs() };
    }

    async getCommitChanges(oid: string): Promise<GitFileChange[]> {
        const commit = await git.readCommit({ fs: this.fs, dir: this.dir, oid });
        const parentOid = commit.commit.parent[0];
        const changes: GitFileChange[] = [];
        if (!parentOid) { // This is the first commit
            const filepaths = await git.listFiles({fs: this.fs, dir: this.dir, ref: oid});
            for(const filepath of filepaths) {
                const content = await this.readFileAtCommitFromFs(oid, filepath) || '';
                changes.push({ filepath, status: 'added', diff: content.split('\n').map(line => ({type: 'add', content: line})) });
            }
        } else { // Compare with parent
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
        return this.readFileAtCommitFromFs(oid, filepath);
    }
}


// --- Native (Capacitor) Git Service ---
// This service runs isomorphic-git in the main renderer process.
// It relies on the Capacitor Native HTTP plugin to automatically proxy
// fetch requests and bypass CORS, which is why it uses the standard `http/web` client.
// This is used for native mobile builds where Web Workers may not have access
// to the native fetch interceptor.
class CapacitorGitService implements GitService {
    isReal = true;
    private fs = new LightningFS('vibecode-fs');
    private dir = '/';

    private async clearFs() {
        for (const file of await this.fs.promises.readdir(this.dir)) {
            await this.fs.promises.unlink(`${this.dir}${file}`);
        }
    }

    private async getHeadFilesFromFs(): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        try {
            await git.checkout({ fs: this.fs, dir: this.dir, ref: 'HEAD', force: true });
            const filepaths = await git.listFiles({ fs: this.fs, dir: this.dir });
            for (const filepath of filepaths) {
                try {
                    const content = await this.fs.promises.readFile(`${this.dir}${filepath}`, 'utf8');
                    files[filepath] = content as string;
                } catch(e) { /* ignore read errors */ }
            }
        } catch (e) { console.warn("Could not read files from HEAD. Repository may be empty."); }
        return files;
    }

    private async writeAppFilesToFs(appFiles: Record<string, string>) {
        const promises: Promise<void>[] = [];
        const trackedFiles = await git.listFiles({ fs: this.fs, dir: this.dir });

        for (const trackedFile of trackedFiles) {
            if (appFiles[trackedFile] === undefined) {
                promises.push(this.fs.promises.unlink(`${this.dir}${trackedFile}`));
            }
        }

        for (const [filepath, content] of Object.entries(appFiles)) {
            promises.push(this.fs.promises.writeFile(`${this.dir}${filepath}`, content));
        }
        await Promise.all(promises);
    }
    
    private async readFileAtCommitFromFs(oid: string, filepath: string): Promise<string | null> {
        try {
            const { blob } = await git.readBlob({ fs: this.fs, dir: this.dir, oid, filepath });
            return Buffer.from(blob).toString('utf8');
        } catch (e) {
            return null;
        }
    }
    
    async clone(url: string, proxyUrl: string | undefined, author: GitAuthor, token: string, onProgress?: (progress: GitProgress) => void): Promise<void> {
        await this.clearFs();
        await git.clone({
          fs: this.fs,
          // Use the standard web http client. Capacitor will intercept its `fetch` calls.
          // The proxyUrl will be undefined in native environments, so no CORS proxy is used.
          http: http,
          dir: this.dir,
          url: url,
          corsProxy: proxyUrl,
          onAuth: () => ({ username: token }),
          onProgress,
        });
    }
    
    async getHeadFiles(): Promise<Record<string, string>> {
        return this.getHeadFilesFromFs();
    }
    
    async status(appFiles: Record<string, string>): Promise<GitStatus[]> {
        const headFiles = await this.getHeadFilesFromFs();
        const allFilepaths = new Set([...Object.keys(appFiles), ...Object.keys(headFiles)]);
        const statusResult: GitStatus[] = [];
        for (const filepath of allFilepaths) {
            const inHead = headFiles[filepath] !== undefined;
            const inWorkspace = appFiles[filepath] !== undefined;
            if (inHead && !inWorkspace) statusResult.push({ filepath, status: GitFileStatus.Deleted });
            else if (!inHead && inWorkspace) statusResult.push({ filepath, status: GitFileStatus.New });
            else if (inHead && inWorkspace && headFiles[filepath] !== appFiles[filepath]) statusResult.push({ filepath, status: GitFileStatus.Modified });
        }
        return statusResult;
    }
    
    async commit(message: string, author: GitAuthor, appFiles: Record<string, string>): Promise<{ oid: string }> {
        await this.writeAppFilesToFs(appFiles);
        // Stage all changes, which is simpler and more robust than trying to be surgical.
        const filepaths = new Set(await git.listFiles({ fs: this.fs, dir: this.dir }));
        const matrix = await git.statusMatrix({ fs: this.fs, dir: this.dir });
        for (const [filepath, head, workdir] of matrix) {
            if (head === 0 && workdir > 0) filepaths.add(filepath); // Track new untracked files
        }
        
        for (const filepath of filepaths) {
            const status = await git.status({ fs: this.fs, dir: this.dir, filepath });
            if (status.includes('deleted')) {
                await git.remove({ fs: this.fs, dir: this.dir, filepath });
            } else if (status !== 'unmodified' && status !== 'absent') {
                await git.add({ fs: this.fs, dir: this.dir, filepath });
            }
        }
        
        const oid = await git.commit({ fs: this.fs, dir: this.dir, message, author });
        return { oid };
    }

    async log(ref?: string): Promise<GitCommit[]> {
        const commits = await git.log({ fs: this.fs, dir: this.dir, ref: ref || 'HEAD' });
        return commits.map(c => ({ oid: c.oid, message: c.commit.message, author: { ...c.commit.author, timestamp: c.commit.author.timestamp }, parent: c.commit.parent, }));
    }

    async listBranches(): Promise<string[]> {
        return await git.listBranches({ fs: this.fs, dir: this.dir });
    }

    async checkout(branch: string): Promise<{ files: Record<string, string> }> {
        await git.checkout({ fs: this.fs, dir: this.dir, ref: branch, force: true });
        return { files: await this.getHeadFilesFromFs() };
    }

    async getCommitChanges(oid: string): Promise<GitFileChange[]> {
        const commit = await git.readCommit({ fs: this.fs, dir: this.dir, oid });
        const parentOid = commit.commit.parent[0];
        const changes: GitFileChange[] = [];
        if (!parentOid) { // This is the first commit
            const filepaths = await git.listFiles({fs: this.fs, dir: this.dir, ref: oid});
            for(const filepath of filepaths) {
                const content = await this.readFileAtCommitFromFs(oid, filepath) || '';
                changes.push({ filepath, status: 'added', diff: content.split('\n').map(line => ({type: 'add', content: line})) });
            }
        } else { // Compare with parent
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
        return this.readFileAtCommitFromFs(oid, filepath);
    }
}


// --- Mock Git Service ---
// A fallback service that does nothing, used when Git can't be initialized.
class MockGitService implements GitService {
    isReal = false;
    async clone(): Promise<void> { console.warn("MockGitService: clone called"); }
    async status(): Promise<GitStatus[]> { console.warn("MockGitService: status called"); return []; }
    async commit(): Promise<{ oid: string }> { console.warn("MockGitService: commit called"); return { oid: 'mock_oid' }; }
    async log(): Promise<GitCommit[]> { console.warn("MockGitService: log called"); return []; }
    async listBranches(): Promise<string[]> { console.warn("MockGitService: listBranches called"); return ['main']; }
    async checkout(): Promise<{ files: Record<string, string> }> { console.warn("MockGitService: checkout called"); return { files: {} }; }
    async getCommitChanges(): Promise<GitFileChange[]> { console.warn("MockGitService: getCommitChanges called"); return []; }
    async readFileAtCommit(): Promise<string | null> { console.warn("MockGitService: readFileAtCommit called"); return null; }
    async getHeadFiles(): Promise<Record<string, string>> { console.warn("MockGitService: getHeadFiles called"); return {}; }
}

// --- Service Factory ---
// This function determines which Git service implementation to use based on the environment.
export function createGitService(isReal: boolean): GitService {
  if (!isReal) {
    return new MockGitService();
  }

  // Prioritize native environments
  if (window.electron?.isElectron) {
    console.log("Initializing Electron Git Service.");
    try {
        return new ElectronGitService();
    } catch (error) {
        console.warn("Could not initialize Electron Git Service. Git functionality will be disabled.", error);
        return new MockGitService();
    }
  }

  // Check for Capacitor *before* the generic Worker check.
  if (Capacitor.isNativePlatform()) {
    console.log("Initializing Capacitor Native Git Service.");
    try {
        // This runs on the main thread to ensure fetch interception works.
        return new CapacitorGitService();
    } catch (error) {
        console.warn("Could not initialize Capacitor Git Service. Git functionality will be disabled.", error);
        return new MockGitService();
    }
  }
  
  // Use the Web Worker service for standard web environments.
  if (window.Worker) {
    console.log("Initializing Web Worker Git Service.");
    try {
      return new WorkerGitService();
    } catch (error) {
      console.warn("Could not initialize the Git Web Worker. Git functionality will be disabled.", error);
      return new MockGitService();
    }
  }

  // Fallback to the mock service if no other option is available.
  console.warn("No suitable Git service found for this environment.");
  return new MockGitService();
}