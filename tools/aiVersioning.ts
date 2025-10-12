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
    originalHeadFiles, 
    aiVirtualFiles,
    onCommitAiToHead 
}: Pick<ToolImplementationsDependencies, 'originalHeadFiles' | 'aiVirtualFiles' | 'onCommitAiToHead'>) => {
    
    return {
        diffVirtualChanges: async () => {
            if (!originalHeadFiles || !aiVirtualFiles) {
                throw new Error("No active AI session to diff. The session may have ended or was not started correctly.");
            }

            const originalFilesSet = new Set(Object.keys(originalHeadFiles));
            const currentFilesSet = new Set(Object.keys(aiVirtualFiles));
            
            const added = [...currentFilesSet].filter(f => !originalFilesSet.has(f));
            const deleted = [...originalFilesSet].filter(f => !currentFilesSet.has(f));
            const modified = [...originalFilesSet]
                .filter(f => currentFilesSet.has(f) && originalHeadFiles[f] !== aiVirtualFiles[f])
                .map(filepath => ({
                    filepath,
                    // For brevity, don't return the full diff content to the AI, just the fact that it changed.
                    // The AI can read the file to see the full content if needed.
                    // diff: performDiff(originalHeadFiles[filepath], aiVirtualFiles[filepath])
                }));

            const modified_files = modified.map(m => m.filepath);

            if (added.length === 0 && deleted.length === 0 && modified.length === 0) {
                return { status: "No changes detected in the virtual filesystem." }
            }
            
            return { added, deleted, modified: modified_files };
        },

        commitToHead: async () => {
            if (!aiVirtualFiles) {
                throw new Error("No active AI session with changes to commit.");
            }
            onCommitAiToHead();
            return { success: true, message: "Changes have been successfully applied to the user's main workspace. The AI session is now complete." };
        }
    };
};