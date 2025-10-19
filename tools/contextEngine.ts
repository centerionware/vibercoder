import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';
import { db } from '../utils/idb';

// --- Function Declarations ---

export const gatherContextForTaskFunction: FunctionDeclaration = {
  name: 'gatherContextForTask',
  description: 'A powerful research tool. Gathers context by searching file names, reading file contents, and searching chat history based on a set of keywords. Use this instead of calling listFiles, readFile, and searchChatHistory multiple times.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      keywords: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'An array of keywords to search for in file paths and chat history.',
      },
    },
    required: ['keywords'],
  },
};


// --- Aggregated Declarations ---
export const declarations = [
    gatherContextForTaskFunction
];

// --- Implementations Factory ---
export const getImplementations = (deps: ToolImplementationsDependencies) => {
    const { getVfsReadyPromise, getAiVirtualFiles, getActiveThread } = deps;
    
    return {
        gatherContextForTask: async (args: { keywords: string[] }) => {
            if (!args.keywords || !Array.isArray(args.keywords) || args.keywords.length === 0) {
                throw new Error("The 'keywords' parameter must be a non-empty array of strings.");
            }
            const lowerKeywords = args.keywords.map(k => k.toLowerCase());
            
            let combinedContext = "--- CONTEXT REPORT ---\n\n";

            // 1. Search File System
            await getVfsReadyPromise();
            const vfs = getAiVirtualFiles();
            if (vfs) {
                const fileSet = new Set(Object.keys(vfs.originalFiles));
                // Apply mutations
                for (const [filepath, mutation] of Object.entries(vfs.mutations)) {
                    if (typeof mutation === 'string') fileSet.add(filepath);
                    else fileSet.delete(filepath);
                }
                const allFiles = Array.from(fileSet);
                const relevantFiles = allFiles.filter(path => lowerKeywords.some(kw => path.toLowerCase().includes(kw)));
                
                if (relevantFiles.length > 0) {
                    combinedContext += "## Relevant Files Found:\n";
                    for (const filepath of relevantFiles.slice(0, 5)) { // Limit to 5 files to avoid excessive context
                        const mutation = vfs.mutations[filepath];
                        let content: string | undefined;
                        if (typeof mutation === 'string') {
                            content = mutation;
                        } else if (mutation === undefined) {
                            content = vfs.originalFiles[filepath];
                        }
                        
                        if (content) {
                            combinedContext += `### File: ${filepath}\n\`\`\`\n${content.substring(0, 1500)}\n\`\`\`\n\n`;
                        }
                    }
                } else {
                     combinedContext += "## File System Scan:\nNo files found matching keywords.\n\n";
                }
            }

            // 2. Search Chat History
            const activeThread = getActiveThread();
            if (activeThread) {
                const allThreadsForProject = await db.threads.where('projectId').equals(activeThread.projectId).toArray();
                const historyResults: string[] = [];
                allThreadsForProject.forEach(thread => {
                    thread.messages.forEach(message => {
                        const contentLower = message.content.toLowerCase();
                        if (lowerKeywords.some(kw => contentLower.includes(kw))) {
                            historyResults.push(`[From thread "${thread.title}"] ${message.role}: ${message.content.substring(0, 200)}...`);
                        }
                    });
                });

                if (historyResults.length > 0) {
                    combinedContext += "## Relevant Chat History Found:\n";
                    combinedContext += historyResults.slice(-5).join('\n') + '\n\n'; // Limit to 5 recent results
                } else {
                    combinedContext += "## Chat History Scan:\nNo messages found matching keywords.\n\n";
                }
            }
            
            combinedContext += "--- END OF REPORT ---";
            return { combinedContext };
        },
    }
};