import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

export const gitViewChangesFunction: FunctionDeclaration = {
    name: 'gitViewChanges',
    description: 'View the list of uncommitted file changes in the current workspace.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const gitCommitFunction: FunctionDeclaration = {
    name: 'gitCommit',
    description: 'Commit the current changes to the local repository.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            message: {
                type: Type.STRING,
                description: 'The commit message.',
            },
        },
        required: ['message'],
    },
};

export const gitPushFunction: FunctionDeclaration = {
    name: 'gitPush',
    description: 'Push committed changes to the configured remote repository.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const gitPullFunction: FunctionDeclaration = {
    name: 'gitPull',
    description: 'Fetch and integrate changes from the remote repository.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const gitFetchFunction: FunctionDeclaration = {
    name: 'gitFetch',
    description: 'Fetch changes from the remote repository without integrating them.',
    parameters: { type: Type.OBJECT, properties: {} },
};

export const declarations: FunctionDeclaration[] = [
    gitViewChangesFunction,
    gitCommitFunction,
    gitPushFunction,
    gitPullFunction,
    gitFetchFunction,
];

// --- Implementations Factory ---
// Note: These are mock implementations for demonstration purposes.
export const getImplementations = ({ changedFiles }: Pick<ToolImplementationsDependencies, 'changedFiles'>) => ({
    gitViewChanges: async () => {
        return { changedFiles: changedFiles || [] };
    },
    gitCommit: async (args: { message: string }) => {
        if (changedFiles.length === 0) {
           throw new Error("No changes to commit.");
        }
        // In a real app, this would interact with a Git library and clear the changedFiles state.
        return { success: true, filesCommitted: changedFiles.length };
    },
    gitPush: async () => {
        return { success: true };
    },
    gitPull: async () => {
        return { success: true };
    },
    gitFetch: async () => {
        return { success: true };
    },
});