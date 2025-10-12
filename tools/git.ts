import { FunctionDeclaration, Type } from '@google/genai';
// Fix: Added `View` enum to imports to fix type errors.
import { ToolImplementationsDependencies, View } from '../types';

// --- Function Declarations ---

export const gitStatusFunction: FunctionDeclaration = {
  name: 'gitStatus',
  description: 'Check the status of the Git repository, showing changed files.',
};

export const gitCommitFunction: FunctionDeclaration = {
  name: 'gitCommit',
  description: 'Commit all staged changes with a given message.',
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

export const declarations = [
    gitStatusFunction,
    gitCommitFunction
];

// --- Implementations Factory ---

export const getImplementations = ({ changedFiles, setActiveView, onSettingsChange, settings }: Pick<ToolImplementationsDependencies, 'changedFiles' | 'setActiveView' | 'onSettingsChange' | 'settings'>) => ({
    gitStatus: async () => {
        // This tool is best when combined with switching to the git view
        // Fix: Used `View.Git` enum member instead of a string literal.
        setActiveView(View.Git);
        return { changedFiles };
    },
    gitCommit: async (args: { message: string }) => {
        if (typeof args.message !== 'string' || !args.message) {
            throw new Error("gitCommit tool call is missing the required 'message' argument.");
        }
        if (changedFiles.length === 0) {
            return { success: false, message: 'No changes to commit.' };
        }
        
        // This is a mock implementation.
        // In a real scenario, this would trigger the commit logic in App.tsx
        console.log(`(Mock) Committing ${changedFiles.length} files with message: "${args.message}"`);
        
        // For the mock, we can't directly clear the changedFiles state here,
        // but we return a success message. The UI commit button in GitView handles the state clearing.
        // Fix: Used `View.Git` enum member instead of a string literal.
        setActiveView(View.Git);
        return { success: true, message: `Committed ${changedFiles.length} files. The list of changed files will be cleared.` };
    },
});