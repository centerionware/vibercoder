import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, View, GitFileStatus } from '../types';
import { performDiff } from '../utils/diff';

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

export const gitPushFunction: FunctionDeclaration = {
  name: 'gitPush',
  description: 'Push committed changes to the configured remote repository.',
};

export const gitPullFunction: FunctionDeclaration = {
  name: 'gitPull',
  description: 'Fetch changes from the remote repository and merge them into the current branch.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      rebase: {
        type: Type.BOOLEAN,
        description: 'If true, use rebase instead of merge to integrate changes. Defaults to false.',
      },
    },
  },
};

export const gitRebaseFunction: FunctionDeclaration = {
    name: 'gitRebase',
    description: 'Re-apply commits from the current branch onto another branch.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            branch: {
                type: Type.STRING,
                description: 'The name of the branch to rebase onto (e.g., "main", "origin/main").',
            },
        },
        required: ['branch'],
    },
};

export const discardWorkspaceChangesFunction: FunctionDeclaration = {
    name: 'discardWorkspaceChanges',
    description: 'Reverts all uncommitted changes in the workspace to match the last commit (HEAD). This will delete new files, restore deleted files, and undo all modifications. This action is irreversible.',
};

export const viewWorkspaceChangesFunction: FunctionDeclaration = {
    name: 'viewWorkspaceChanges',
    description: 'Lists all files with uncommitted changes and provides their diffs. This is the first step in the commit workflow. After calling this tool, you MUST analyze the returned diffs and formulate a commit message adhering to modern Git standards. Then, you MUST use the `populateCommitMessage` tool to place your generated message into the UI.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const populateCommitMessageFunction: FunctionDeclaration = {
    name: 'populateCommitMessage',
    description: 'Populates the commit message input field in the Git view with the provided text. This should be called after you have formulated a commit message based on the diffs from `viewWorkspaceChanges`.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            message: {
                type: Type.STRING,
                description: 'The commit message text to populate.',
            },
        },
        required: ['message'],
    },
};


export const declarations = [
    listBranchesFunction,
    switchBranchFunction,
    gitLogFunction,
    viewCommitChangesFunction,
    gitPushFunction,
    gitPullFunction,
    gitRebaseFunction,
    discardWorkspaceChangesFunction,
    viewWorkspaceChangesFunction,
    populateCommitMessageFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ gitServiceRef, files, setFiles, setActiveView, onGitPush, onGitPull, onGitRebase, onDiscardChanges, aiRef, setCommitMessage }: Pick<ToolImplementationsDependencies, 'gitServiceRef' | 'files' | 'setFiles' | 'setActiveView' | 'onGitPush' | 'onGitPull' | 'onGitRebase' | 'onDiscardChanges' | 'aiRef' | 'setCommitMessage'>) => {
    
    const getSvc = () => {
        const svc = gitServiceRef.current;
        if (!svc || !svc.isReal) throw new Error("Git service is not available or is running in mock mode.");
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
        gitPush: async () => {
            await onGitPush();
            setActiveView(View.Git);
            return { success: true, message: "Push command executed." };
        },
        gitPull: async (args: { rebase?: boolean }) => {
            await onGitPull(args.rebase || false);
            setActiveView(View.Git);
            return { success: true, message: "Pull command executed." };
        },
        gitRebase: async (args: { branch: string }) => {
            if (typeof args.branch !== 'string' || !args.branch) {
                throw new Error("gitRebase tool call is missing the required 'branch' argument.");
            }
            await onGitRebase(args.branch);
            setActiveView(View.Git);
            return { success: true, message: `Rebase command executed onto ${args.branch}.` };
        },
        discardWorkspaceChanges: async () => {
            await onDiscardChanges();
            setActiveView(View.Git);
            return { success: true, message: "All uncommitted workspace changes have been discarded." };
        },
        viewWorkspaceChanges: async () => {
            const svc = getSvc();
            const changes = await svc.status(files);
            if (changes.length === 0) {
                return { changes: [], message: "No uncommitted changes in the workspace." };
            }
        
            const detailedChanges = await Promise.all(changes.map(async (change) => {
                const headContent = change.status === GitFileStatus.New ? '' : await svc.readFileAtCommit('HEAD', change.filepath) || '';
                const workspaceContent = files[change.filepath] ?? '';
                
                const diffLines = performDiff(headContent, workspaceContent);
                const diffText = diffLines.map(line => {
                    if (line.type === 'add') return `+${line.content}`;
                    if (line.type === 'del') return `-${line.content}`;
                    return ` ${line.content}`; // Eql lines are not prefixed for standard diff format
                }).join('\n');
                
                const statusMap = {
                    [GitFileStatus.New]: 'new',
                    [GitFileStatus.Modified]: 'modified',
                    [GitFileStatus.Deleted]: 'deleted',
                    [GitFileStatus.Unmodified]: 'unmodified',
                };
        
                return {
                    filepath: change.filepath,
                    status: statusMap[change.status as keyof typeof statusMap] || 'unknown',
                    diff: diffText,
                };
            }));
            
            const instructions = `You have received the list of file changes and their diffs.
Your next steps are:
1. **Analyze the Diffs:** Carefully review the code changes to understand the purpose and scope of the modifications.
2. **Formulate a Commit Message:** Craft a high-quality commit message using the Conventional Commits standard. The format MUST be:
   \`\`\`
   <type>(<scope>): <subject>
   <BLANK LINE>
   <body>
   \`\`\`
   - **type:** Must be one of: \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`test\`, \`chore\`.
   - **scope:** (Optional) The part of the codebase affected (e.g., \`auth\`, \`ui\`, \`git\`).
   - **subject:** A concise, imperative-mood summary of the change. Do not capitalize the first letter or end with a period.
   - **body:** (Optional) A more detailed explanation of the changes.
3. **Populate the Message:** Call the \`populateCommitMessage\` tool with your crafted message.`;

            return { 
                changes: detailedChanges,
                instructions: instructions
            };
        },
        populateCommitMessage: async (args: { message: string }) => {
            if (typeof args.message !== 'string') {
                throw new Error("populateCommitMessage tool call is missing the required 'message' argument.");
            }
            setCommitMessage(args.message);
            setActiveView(View.Git);
            return { success: true, message: "Commit message field has been populated." };
        },
    };
};