import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import FS from '@isomorphic-git/lightning-fs';
import { GitService, GitAuthor, GitStatus, GitFileStatus } from '../types';

// Initialize a persistent, in-browser filesystem.
const fs = new FS('vibecode-git-fs');
const dir = '/';

// --- Real Git Service (for Native/Desktop) ---
const realGitService: GitService = {
  isReal: true,

  async clone(url, proxyUrl, author) {
    // Wipe the filesystem before cloning
    const oldFiles = await fs.promises.readdir(dir);
    for (const file of oldFiles) {
        await fs.promises.unlink(`/${file}`).catch(() => {});
        await fs.promises.rmdir(`/${file}`, { recursive: true }).catch(() => {});
    }

    await git.clone({
      fs,
      http,
      dir,
      corsProxy: proxyUrl,
      url,
      author,
    });
    
    // After cloning, read all files and return them to update the app state
    const files: Record<string, string> = {};
    const readdir = async (currentDir: string) => {
        const entries = await fs.promises.readdir(currentDir);
        for(const entry of entries) {
            const path = `${currentDir === '/' ? '' : currentDir}/${entry}`;
            const stat = await fs.promises.stat(path);
            if (stat.isDirectory()) {
                if (entry !== '.git') await readdir(path);
            } else {
                 const content = await fs.promises.readFile(path, 'utf8');
                 files[path.substring(1)] = content as string;
            }
        }
    }
    await readdir(dir);
    return { files };
  },

  async status(appFiles) {
    // Sync app state to virtual FS
     for (const filepath in appFiles) {
         await fs.promises.writeFile(`${dir}${filepath}`, appFiles[filepath], 'utf8');
     }

    const gitStatus = await git.statusMatrix({ fs, dir });
    const statuses: GitStatus[] = gitStatus.map(([filepath, head, workdir, stage]) => {
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
    // Sync files before commit
    for (const filepath in appFiles) {
        await fs.promises.writeFile(`${dir}${filepath}`, appFiles[filepath], 'utf8');
    }
    // Add all changes
    const files = await git.statusMatrix({ fs, dir });
    for (const [filepath] of files) {
        await git.add({ fs, dir, filepath });
    }

    const oid = await git.commit({
      fs,
      dir,
      message,
      author,
    });
    return { oid };
  },
};

// --- Mock Git Service (for Web Sandbox) ---
const mockGitService: GitService = {
  isReal: false,

  async clone() {
    // Simulate a delay and return an empty object
    await new Promise(res => setTimeout(res, 1500));
    alert('Cloned (mock). Workspace is unchanged in the web sandbox.');
    return { files: {} }; // Return empty files as clone is a mock
  },

  async status(files, changedFilePaths = []) {
    // The mock service just reflects the state tracked by useFiles
    return changedFilePaths.map(filepath => ({
      filepath,
      status: GitFileStatus.Modified,
    }));
  },

  async commit(message) {
    await new Promise(res => setTimeout(res, 1000));
    return { oid: 'mock-commit-sha' };
  },
};

// --- Service Factory ---
export const createGitService = (isReal: boolean): GitService => {
  return isReal ? realGitService : mockGitService;
};