import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';
import { db } from '../utils/idb';

// --- Function Declarations ---
export const searchChatHistoryFunction: FunctionDeclaration = {
    name: 'searchChatHistory',
    description: 'Search the entire chat history across all threads for a specific query to find relevant context or past conversations. Use this to recall previous information or decisions.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: 'The search query. Should be a few keywords or a specific question.',
            },
        },
        required: ['query'],
    },
};

export const declarations: FunctionDeclaration[] = [
    searchChatHistoryFunction
];

// --- Implementations Factory ---
export const getImplementations = ({ activeThread }: Pick<ToolImplementationsDependencies, 'activeThread'>) => ({
    searchChatHistory: async (args: { query: string }) => {
        if (!activeThread) {
            throw new Error("No active chat thread found. Cannot determine which project to search.");
        }
        const projectId = activeThread.projectId;
        
        // Fetch the most up-to-date data directly from the database to ensure complete history access.
        const allThreadsForProject = await db.threads.where('projectId').equals(projectId).toArray();

        const query = args.query.toLowerCase();
        const results: any[] = [];

        allThreadsForProject.forEach(thread => {
            thread.messages.forEach(message => {
                if (message.content.toLowerCase().includes(query)) {
                    results.push({
                        threadId: thread.id,
                        threadTitle: thread.title,
                        messageRole: message.role,
                        messageContent: message.content.substring(0, 200) + (message.content.length > 200 ? '...' : ''), // Truncate for brevity
                    });
                }
            });
        });

        // Always return the same structure, even if empty.
        return { searchResults: results.slice(0, 5) };
    },
});