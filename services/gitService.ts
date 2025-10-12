import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { fs } from 'memfs';
import {
  GitService, GitStatus, GitFileStatus, GitCommit, GitAuthor,
  GitFileChange, GitProgress
} from '../types';
import { isNativeEnvironment } from '../utils/environment';
import { nativeFetch } from './nativeFetch';
import { performDiff } from '../utils/diff';

const dir = '/';

class IsomorphicGitService implements GitService {
    isReal = true;

    private getHttp() {
        if (isNativeEnvironment()) {
            return {
                ...http,
                request: async (args: any) => {
                    // Adapt isomorphic-git's request to our native fetch polyfill
                    const requestInit: RequestInit = {
                        method: args.method,
                        headers: args.headers,
                        body: args.body,
                    };
                    const response = await nativeFetch(args.url, requestInit);
                    
                    // Adapt the Response back to what isomorphic-git expects
                    return {
                        url: response.url,
                        method: response.method,
                        statusCode: response.status,
                        statusMessage: response.statusText,
                        body: response.body, // The body is a stream
                        headers: Object.fromEntries(response.headers.entries()),
                    };
                }
            };
        }
        return http;
    }

    async clone(url: string, proxyUrl: string | undefined, author: GitAuthor, token: string, onProgress?: (progress: GitProgress) => void): Promise<void> {
        // Reset filesystem for a new clone
        const newFs = fs.promises;
        try {
            const rootEntries = await newFs.readdir(dir);
            for(const entry of rootEntries) {
                await newFs.rm(dir + entry, { recursive: true, force: true });
            }
        } catch (e) {
            // Ignore if directory doesn't exist yet
        }
        
        await git.clone({
            fs: { promises: newFs },
            http: this.getHttp(),
            dir,
            corsProxy: isNativeEnvironment() ? undefined : proxyUrl,
            url,
            onProgress: (e) => onProgress?.(e as GitProgress),
            onAuth: () => ({ username: token }),
        });
    }

    async status(appFiles: Record<string, string>, changedFilePaths?: string[]): Promise<GitStatus[]> {
        // This is a simplified status. Isomorphic-git's status matrix is more complex.
        // For this app, we're likely just comparing the workspace to HEAD.
        const status: GitStatus[] = [];
        const headFiles = await this.getHeadFiles();

        const allFiles = new Set([...Object.keys(appFiles), ...Object.keys(headFiles)]);

        for (const filepath of allFiles) {
            const inHead = headFiles[filepath] !== undefined;
            const inWorkspace = appFiles[filepath] !== undefined;

            if (inHead && !inWorkspace) {
                status.push({ filepath, status: GitFileStatus.Deleted });
            } else if (!inHead && inWorkspace) {
                status.push({ filepath, status: GitFileStatus.New });
            } else if (inHead && inWorkspace && headFiles[filepath] !== appFiles[filepath]) {
                status.push({ filepath, status: GitFileStatus.Modified });
            }
        }
        return status;
    }
    
    private async writeAppFilesToFs(appFiles: Record<string, string>) {
        // A helper to sync the virtual FS with the app's state before a commit
        const promises: Promise<void>[] = [];
        for (const [filepath, content] of Object.entries(appFiles)) {
            promises.push(fs.promises.writeFile(`${dir}${filepath}`, content));
        }
        // Need to handle deletions too
        const trackedFiles = await git.listFiles({ fs, dir });
        for(const trackedFile of trackedFiles) {
            if (appFiles[trackedFile] === undefined) {
                promises.push(fs.promises.unlink(`${dir}${trackedFile}`));
            }
        }
        await Promise.all(promises);
    }

    async commit(message: string, author: GitAuthor, appFiles: Record<string, string>): Promise<{ oid: string }> {
        await this.writeAppFilesToFs(appFiles);
        
        // Stage all changes
        const status = await git.statusMatrix({ fs, dir });
        for (const [filepath, head, workdir] of status) {
            if (head !== workdir) { // If changed
                await git.add({ fs, dir, filepath });
            }
        }

        const oid = await git.commit({
            fs,
            dir,
            message,
            author,
        });
        return { oid };
    }

    async log(ref: string = 'HEAD'): Promise<GitCommit[]> {
        const commits = await git.log({ fs, dir, ref });
        return commits.map(c => ({
            oid: c.oid,
            message: c.commit.message,
            author: { ...c.commit.author, timestamp: c.commit.author.timestamp },
            parent: c.commit.parent,
        }));
    }

    async listBranches(): Promise<string[]> {
        return git.listBranches({ fs, dir });
    }

    async checkout(branch: string): Promise<{ files: Record<string, string> }> {
        await git.checkout({ fs, dir, ref: branch, force: true });
        return { files: await this.getHeadFiles() };
    }

    async getCommitChanges(oid: string): Promise<GitFileChange[]> {
        const commit = await git.readCommit({ fs, dir, oid });
        const parentOid = commit.commit.parent[0];
        if (!parentOid) { // Initial commit
            const filepaths = await git.listFiles({fs, dir, ref: oid});
            return Promise.all(filepaths.map(async (filepath) => ({
                filepath,
                status: 'added' as 'added',
                diff: (await this.readFileAtCommit(oid, filepath) || '').split('\n').map(line => ({type: 'add', content: line}))
            })));
        }
        
        const changes: GitFileChange[] = [];

        await git.walk({
            fs,
            dir,
            trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: oid })],
            map: async function(filepath, [A, B]) {
                if (filepath === '.') return;
                const aOid = await A?.oid();
                const bOid = await B?.oid();
                if (aOid === bOid) return; // Unchanged

                let status: 'added' | 'deleted' | 'modified' = 'modified';
                if (!aOid) status = 'added';
                if (!bOid) status = 'deleted';

                const contentA = status === 'added' ? '' : Buffer.from((await git.readBlob({ fs, dir, oid: aOid! })).blob).toString();
                const contentB = status === 'deleted' ? '' : Buffer.from((await git.readBlob({ fs, dir, oid: bOid! })).blob).toString();

                changes.push({
                    filepath,
                    status,
                    diff: performDiff(contentA, contentB)
                });
            }
        });
        return changes;
    }

    async readFileAtCommit(oid: string, filepath: string): Promise<string | null> {
        try {
            const { blob } = await git.readBlob({ fs, dir, oid, filepath });
            return Buffer.from(blob).toString('utf8');
        } catch (e) {
            console.error(`Could not read file ${filepath} at commit ${oid}`, e);
            return null;
        }
    }

    async getHeadFiles(): Promise<Record<string, string>> {
        const files: Record<string, string> = {};
        try {
            const filepaths = await git.listFiles({ fs, dir });
            for (const filepath of filepaths) {
                const { blob } = await git.readBlob({ fs, dir, oid: 'HEAD', filepath });
                files[filepath] = Buffer.from(blob).toString('utf8');
            }
        } catch(e) {
            // Likely an empty repo
            console.warn("Could not get HEAD files, possibly an empty repository.", e);
        }
        return files;
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
  return isReal ? new IsomorphicGitService() : new MockGitService();
}