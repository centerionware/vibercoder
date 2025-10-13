import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';
import { performDiff } from '../utils/diff';

// --- Function Declarations ---

export const diffVirtualChangesFunction: FunctionDeclaration = {
  name: 'diffVirtualChanges',
  description: "Compare the changes made in the current AI session against the original files from the start of the session. Use this to review your work before committing it to the user's workspace.",
};

export const commitToHeadFunction: FunctionDeclaration = {
  name: 'commitToHead',
  description: "Finalizes the AI's work by applying all changes from its virtual session to the user's main workspace. This makes the changes visible to the user and ready for a Git commit. This is the final step for any task that modifies files.",
};

// --- Aggregated Declarations ---
export const declarations = [
    diffVirtualChangesFunction,
    commitToHeadFunction
];

// --- Implementations Factory ---
export const getImplementations = ({ 
    getAiVirtualFiles,
    onCommitAiToHead,
    getVfsReadyPromise
}: Pick<ToolImplementationsDependencies, 'getAiVirtualFiles' | 'onCommitAiToHead' | 'getVfsReadyPromise'>) => {
    
    return {
        diffVirtualChanges: async () => {
            await getVfsReadyPromise();
            const vfs = getAiVirtualFiles();

            if (!vfs) {
                throw new Error("No active AI session to diff. The session may have ended or was not started correctly.");
            }
            
            const added: string[] = [];
            const deleted: string[] = [];
            const modified: string[] = [];
            
            for (const [filepath, mutation] of Object.entries(vfs.mutations)) {
                const existsInOriginal = vfs.originalFiles[filepath] !== undefined;
                
                if (typeof mutation === 'string') { // writeFile was called
                    if (existsInOriginal) {
                        if (vfs.originalFiles[filepath] !== mutation) {
                            modified.push(filepath);
                        }
                    } else {
                        added.push(filepath);
                    }
                } else { // DELETED_FILE_SENTINEL
                    if (existsInOriginal) {
                        deleted.push(filepath);
                    }
                    // If it was added and then deleted in the same session, it's a no-op, so we don't list it.
                }
            }

            if (added.length === 0 && deleted.length === 0 && modified.length === 0) {
                return { status: "No changes detected in the virtual filesystem." }
            }
            
            return { added, deleted, modified };
        },

        commitToHead: async () => {
            await getVfsReadyPromise();
            const aiVirtualFiles = getAiVirtualFiles();
            if (!aiVirtualFiles) {
                throw new Error("No active AI session with changes to commit.");
            }
            onCommitAiToHead();
            return { success: true, message: "Changes have been successfully applied to the user's main workspace. The AI session is now complete." };
        }
    };
};