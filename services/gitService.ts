
import { v4 as uuidv4 } from 'uuid';
import {
  GitService, GitStatus, GitCommit, GitAuthor,
  GitFileChange, GitProgress
} from '../types';
import { isNativeEnvironment } from '../utils/environment';
import { nativeFetch } from './nativeFetch';

// This is the main thread service that acts as a proxy to the web worker.
class WorkerGitService implements GitService {
    isReal = true;
    private worker: Worker;
    private pendingRequests: Map<string, { resolve: (value: any) => void; reject: (reason?: any) => void; }>;
    private progressListeners: Map<string, (progress: GitProgress) => void>;

    constructor() {
        this.worker = new Worker('/git.worker.js', { type: 'module' });
        this.pendingRequests = new Map();
        this.progressListeners = new Map();

        // After creating the worker, send it an initialization message so it knows
        // whether to use its internal web-based http client or proxy requests back here.
        this.worker.postMessage({ type: 'init', payload: { isNative: isNativeEnvironment() } });

        this.worker.onmessage = async (event) => {
            const { type, id, payload } = event.data;

            // Handle HTTP requests proxied from the worker in native environments
            if (type === 'http-request') {
                try {
                    // The body is an array of Uint8Arrays. Reconstruct it into an async iterable stream for fetch.
                    const bodyStream = payload.body ? (async function*() {
                        for (const chunk of payload.body) {
                            yield chunk;
                        }
                    })() : undefined;
                    
                    // FIX: Cast `bodyStream` to `any` because `BodyInit` does not include AsyncGenerators, but our custom nativeFetch implementation handles it.
                    const response = await nativeFetch(payload.url, {
                        method: payload.method,
                        headers: payload.headers,
                        body: bodyStream as any,
                    });

                    // Read the response body into a single buffer to send back to the worker.
                    const responseBody = new Uint8Array(await response.arrayBuffer());
                    const responseHeaders: Record<string, string> = {};
                    response.headers.forEach((value, key) => { responseHeaders[key] = value; });

                    this.worker.postMessage({
                        type: 'http-response',
                        payload: {
                            requestId: payload.requestId,
                            response: {
                                url: response.url,
                                method: payload.method, // Reflect the original method
                                statusCode: response.status,
                                statusMessage: response.statusText,
                                body: responseBody,
                                headers: responseHeaders,
                            }
                        }
                    });
                } catch (error) {
                    const err = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
                    this.worker.postMessage({
                        type: 'http-response',
                        payload: { requestId: payload.requestId, error: err }
                    });
                }
                return;
            }
            
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
        // In native mode, the proxyUrl is ignored by the worker's custom http client.
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
      return new WorkerGitService();
    } catch (error) {
      console.warn(
        "Could not initialize the Git Web Worker. This is expected in some sandboxed environments. Git functionality will be disabled.",
        error
      );
      return new MockGitService();
    }
  }
  return new MockGitService();
}
