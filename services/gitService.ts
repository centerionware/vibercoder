import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import FS from '@isomorphic-git/lightning-fs';
import { GitService, GitAuthor, GitStatus, GitFileStatus, GitCommit, GitFileChange, DiffLine } from '../types';
import { Buffer } from 'buffer';
import { performDiff } from '../utils/diff';

// Lazily initialize the persistent, in-browser filesystem to prevent startup crashes.
let fsInstance: FS | null = null;
const getFs = (): FS => {
    if (!fsInstance) {
        fsInstance = new FS('vibecode-git-fs');
    }
    return fsInstance;
};

const dir = '/';

const readFileFromFS = async (currentDir: string): Promise<Record<string, string>> => {
    const fs = getFs();
    const files: Record<string, string> = {};
    const entries = await fs.promises.readdir(currentDir);
    for (const entry of entries) {
        if (entry === '.git') continue;
        const path = `${currentDir === '/' ? '' : currentDir}/${entry}`;
        const stat = await fs.promises.stat(path);
        if (stat.isDirectory()) {
            const nestedFiles = await readFileFromFS(path);
            Object.assign(files, nestedFiles);
        } else {
            const content = await fs.promises.readFile(path, 'utf8');
            files[path.substring(1)] = content as string;
        }
    }
    return files;
};

// --- Real Git Service (for Native/Desktop) ---
const realGitService: GitService = {
  isReal: true,

  async clone(url, proxyUrl, author, token) {
    const fs = getFs();
    // Wipe the filesystem before cloning
    const oldFiles = await fs.promises.readdir(dir);
    for (const file of oldFiles) {
        if (file === '.git') {
            await fs.promises.rmdir(`/${file}`).catch(() => {});
        } else {
            await fs.promises.unlink(`/${file}`).catch(() => {});
        }
    }
    
    console.log(`Attempting to clone from URL: ${url}`);
    if (proxyUrl) {
      console.log(`Using CORS proxy: ${proxyUrl}`);
    } else {
      console.log('No CORS proxy configured (expected in native environment).');
    }

    try {
      await git.clone({
        fs, http, dir, corsProxy: proxyUrl, url,
        onAuth: () => ({ username: token }),
        onMessage: (message) => {
          console.info(`Git clone message: ${message.trim()}`);
        },
        onProgress: (event) => {
          if (event.phase) {
            console.log(`Git clone phase: ${event.phase}, Loaded: ${event.loaded}, Total: ${event.total}`);
          }
        }
      });
    } catch (e: any) {
      console.error("isomorphic-git clone error object:", e);
      let detailedMessage = e.message;
      if (e.data?.response) {
        detailedMessage += ` | Server response: ${e.data.response}`;
      }
      if (e.data?.statusCode) {
        detailedMessage += ` | Status code: ${e.data.statusCode}`;
      }
      throw new Error(detailedMessage);
    }
    
    return { files: await readFileFromFS(dir) };
  },

  async status(appFiles) {
     const fs = getFs();
     for (const filepath in appFiles) {
         await fs.promises.writeFile(`${dir}${filepath}`, appFiles[filepath], 'utf8');
     }
    const gitStatus = await git.statusMatrix({ fs, dir });
    const statuses: GitStatus[] = gitStatus.map(([filepath, head, workdir]) => {
        let status: GitFileStatus;
        if (head === 0 && workdir === 2) status = GitFileStatus.New;
        else if (workdir === 0) status = GitFileStatus.Deleted;
        else if (head === 1 && workdir === 2) status = GitFileStatus.Modified;
        else status = GitFileStatus.Unmodified;
        return { filepath, status };
    });
    return statuses.filter(s => s.status !== GitFileStatus.Unmodified);
  },

  async commit(message, author, appFiles) {
    const fs = getFs();
    for (const filepath in appFiles) {
        await fs.promises.writeFile(`${dir}${filepath}`, appFiles[filepath], 'utf8');
    }
    const files = await git.statusMatrix({ fs, dir });
    for (const [filepath] of files) {
        await git.add({ fs, dir, filepath });
    }
    const oid = await git.commit({ fs, dir, message, author });
    return { oid };
  },

  async log(ref = 'HEAD'): Promise<GitCommit[]> {
    const fs = getFs();
    const commits = await git.log({ fs, dir, ref, depth: 50 });
    return commits.map(c => ({
      oid: c.oid,
      message: c.commit.message,
      author: { ...c.commit.author },
      parent: c.commit.parent,
    }));
  },

  async listBranches(): Promise<string[]> {
    const fs = getFs();
    return git.listBranches({ fs, dir });
  },

  async checkout(branch: string): Promise<{ files: Record<string, string> }> {
    const fs = getFs();
    await git.checkout({ fs, dir, ref: branch, force: true });
    return { files: await readFileFromFS(dir) };
  },

  async readFileAtCommit(oid: string, filepath: string): Promise<string | null> {
    const fs = getFs();
    try {
        const { blob } = await git.readBlob({ fs, dir, oid, filepath });
        return Buffer.from(blob).toString('utf8');
    } catch (e) {
        console.error(`Could not read file ${filepath} at ${oid}`, e);
        return null; // File might not exist in that commit
    }
  },

  async getCommitChanges(oid: string): Promise<GitFileChange[]> {
    const fs = getFs();
    const commit = await git.readCommit({ fs, dir, oid });
    const parentOid = commit.commit.parent[0];
    if (!parentOid) { // Initial commit
        const changes: GitFileChange[] = [];
        await git.walk({
            fs, dir, trees: [git.TREE({ ref: oid })],
            map: async (filepath, [entry]) => {
                if (filepath === '.') return;
                const content = await this.readFileAtCommit(await entry.oid(), filepath) || '';
                changes.push({ filepath, status: 'added', diff: performDiff('', content) });
            }
        });
        return changes;
    }

    const changes: GitFileChange[] = [];
    await git.walk({
      fs, dir,
      trees: [git.TREE({ ref: parentOid }), git.TREE({ ref: oid })],
      map: async (filepath, [A, B]) => {
        if (filepath === '.' || !A && !B) return;
        const Aoid = await A?.oid();
        const Boid = await B?.oid();

        if (Aoid === Boid) return; // Unchanged

        const contentA = Aoid ? await this.readFileAtCommit(Aoid, filepath) : '';
        const contentB = Boid ? await this.readFileAtCommit(Boid, filepath) : '';

        let status: GitFileChange['status'] = 'modified';
        if (!Aoid) status = 'added';
        if (!Boid) status = 'deleted';

        changes.push({ filepath, status, diff: performDiff(contentA!, contentB!) });
      },
    });
    return changes;
  },
  
  async getHeadFiles(): Promise<Record<string, string>> {
    const fs = getFs();
    const files: Record<string, string> = {};
    try {
        await git.walk({
            fs, dir,
            trees: [git.TREE({ ref: 'HEAD' })],
            map: async (filepath, [entry]) => {
                if (filepath === '.' || !entry) return;
                const type = await entry.type();
                if (type === 'blob') {
                    const oid = await entry.oid();
                    const content = await this.readFileAtCommit(oid, filepath);
                    if (content !== null) {
                        files[filepath] = content;
                    }
                }
            },
        });
    } catch (e) {
        console.warn("Could not get HEAD files, possibly an empty repo. Returning empty.", e);
        return {};
    }
    return files;
  }
};

// --- Mock Git Service (for Web Sandbox) ---
const mockGitService: GitService = {
  isReal: false,
  async clone() {
    await new Promise(res => setTimeout(res, 1500));
    alert(`Cloning is a mock action in the web sandbox.`);
    return { files: {} };
  },
  async status(files, changedFilePaths = []) {
    return changedFilePaths.map(filepath => ({
      filepath,
      status: GitFileStatus.Modified,
    }));
  },
  async commit(message) {
    await new Promise(res => setTimeout(res, 1000));
    return { oid: 'mock-commit-sha' };
  },
  async log() {
    return [
        { oid: 'abc1234', message: 'feat: Implement new UI\n\nMore details about this great feature.', author: { name: 'Vibe Coder', email: 'vibecoder@example.com', timestamp: Date.now() / 1000 }, parent: ['def5678'] },
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
    console.log("MOCK: Getting HEAD files.");
    // In a mock environment, the current files *are* the head files.
    // This part of the code is hard to mock perfectly without a full git history.
    // We'll rely on the parent `useFiles` hook to provide the files.
    // This is a known limitation of the mock service. The real service is what matters.
    return Promise.resolve({
        'index.html': `<html><body>Mock HEAD</body></html>`,
        'index.tsx': `console.log("Mock HEAD");`,
    });
  },
};

// --- Service Factory ---
export const createGitService = (isReal: boolean): GitService => {
  return isReal ? realGitService : mockGitService;
};