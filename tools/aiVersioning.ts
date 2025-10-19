import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

export const commitToHeadFunction: FunctionDeclaration = {
  name: 'commitToHead',
  description: 'Saves all changes made in the current virtual file session (VFS) to the main workspace. This action is final for the current task and makes the changes visible to the user. This MUST be the final step after all file modifications are complete.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const discardAiChangesFunction: FunctionDeclaration = {
  name: 'discardAiChanges',
  description: 'Discards all changes made in the current virtual file session (VFS). Use this if you have made a mistake and need to start over, or if the user asks you to undo your work. This action is irreversible for the current session.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const declarations: FunctionDeclaration[] = [
    commitToHeadFunction,
    discardAiChangesFunction,
];

// --- Implementations Factory ---
export const getImplementations = ({ onCommitAiToHead, deleteVfsSession, setAiVirtualFiles }: Pick<ToolImplementationsDependencies, 'onCommitAiToHead' | 'deleteVfsSession' | 'setAiVirtualFiles'>) => ({
    commitToHead: async () => {
        onCommitAiToHead();
        return { success: true, message: "All virtual changes have been saved to the main workspace." };
    },
    discardAiChanges: async () => {
        // First, delete the persistent session from the database.
        await deleteVfsSession();
        // Then, clear the in-memory VFS reference to reset the state for the next turn.
        setAiVirtualFiles(null);
        return { success: true, message: "All uncommitted AI changes in the virtual session have been discarded." };
    },
});