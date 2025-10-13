import { v4 as uuidv4 } from 'uuid';
import {
  GitService, GitStatus, GitCommit, GitAuthor,
  GitFileChange, GitProgress
} from '../types';

// This is the main thread service that acts as a proxy to the web worker.
class WorkerGitService implements GitService {
    isReal = true;
    private worker: Worker;
    private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; }>;
    private progressListeners: Map<string, (progress: GitProgress) => void>;

    constructor() {
        // Use a root-relative path. The build process places git.worker.js in the
        // root of the web server directory (`www`), alongside the main application script.
        // This avoids issues with `import.meta.url` in sandboxed environments where it may
        // not be a valid base URL, preventing a "Failed to construct 'URL'" error.
        this.worker = new Worker('/git.worker.js', { type: 'module' });

        this.pendingRequests = new Map();
        this.progressListeners = new Map();

        this.worker.onmessage = (event) => {
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
            this.progressListeners.delete(id); // Clean up progress listener
        };

        this.worker.onerror = (event) => {
            console.error("Git Worker Error:", event);
            const error = new Error('Git worker terminated unexpectedly.');
            // Reject all pending requests
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

export function createGitService(isReal: boolean): GitService {
  if (isReal && window.Worker) {
    try {
      // Attempt to create the real service that uses the Web Worker.
      return new WorkerGitService();
    } catch (error) {
      // If constructing the worker fails (e.g., due to sandboxing or security policies),
      // log a warning to the console and gracefully fall back to the mock service.
      // This prevents the entire application from crashing.
      console.warn(
        "Could not initialize the Git Web Worker. This is expected in some sandboxed environments. Git functionality will be disabled.",
        error
      );
      return new MockGitService();
    }
  }
  // If workers are not supported or if the feature is disabled, return the mock service.
  return new MockGitService();
}
