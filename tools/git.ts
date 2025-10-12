import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, View } from '../types';

// --- Function Declarations ---

export const listBranchesFunction: FunctionDeclaration = {
  name: 'listBranches',
  description: 'List all local branches in the Git repository.',
};

export const switchBranchFunction: FunctionDeclaration = {
  name: 'switchBranch',
  description: 'Switch the workspace to a different branch. This will replace all files in the editor with the files from the head of the specified branch.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      branchName: {
        type: Type.STRING,
        description: 'The name of the branch to check out.',
      },
    },
    required: ['branchName'],
  },
};

export const gitLogFunction: FunctionDeclaration = {
  name: 'gitLog',
  description: 'View the commit history for the current branch.',
};

export const viewCommitChangesFunction: FunctionDeclaration = {
  name: 'viewCommitChanges',
  description: "View the list of files that were changed in a specific commit, and see the diff for each file.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      commitOid: {
        type: Type.STRING,
        description: 'The full SHA-1 hash (oid) of the commit to inspect.',
      },
    },
    required: ['commitOid'],
  },
};

export const declarations = [
    listBranchesFunction,
    switchBranchFunction,
    gitLogFunction,
    viewCommitChangesFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ gitServiceRef, setFiles, setActiveView }: Pick<ToolImplementationsDependencies, 'gitServiceRef' | 'setFiles' | 'setActiveView'>) => {
    
    const getSvc = () => {
        const svc = gitServiceRef.current;
        if (!svc) throw new Error("Git service is not available.");
        return svc;
    }

    return {
        listBranches: async () => {
            const svc = getSvc();
            const branches = await svc.listBranches();
            return { branches };
        },
        switchBranch: async (args: { branchName: string }) => {
            if (typeof args.branchName !== 'string' || !args.branchName) {
                throw new Error("switchBranch tool call is missing the required 'branchName' argument.");
            }
            const svc = getSvc();
            const { files } = await svc.checkout(args.branchName);
            setFiles(files);
            setActiveView(View.Git);
            return { success: true, message: `Switched to branch "${args.branchName}". Files have been updated.` };
        },
        gitLog: async () => {
            const svc = getSvc();
            const commits = await svc.log();
            // Return a more concise version for the AI
            const summarizedCommits = commits.map(c => ({
                oid: c.oid,
                message: c.message.split('\n')[0], // Only first line
                author: c.author.name,
                date: new Date(c.author.timestamp * 1000).toISOString().split('T')[0],
            }));
            return { log: summarizedCommits };
        },
        viewCommitChanges: async (args: { commitOid: string }) => {
            if (typeof args.commitOid !== 'string' || !args.commitOid) {
                throw new Error("viewCommitChanges tool call is missing the required 'commitOid' argument.");
            }
            const svc = getSvc();
            const changes = await svc.getCommitChanges(args.commitOid);
            // Don't return the full diff to the AI, just the file list and status.
            const summarizedChanges = changes.map(c => ({
                filepath: c.filepath,
                status: c.status,
            }));
            setActiveView(View.Git); // Switch to Git view so user can see the changes
            return { changes: summarizedChanges };
        },
    };
};