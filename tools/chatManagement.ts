import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';
import { db } from '../utils/idb';

// --- Function Declarations ---

export const renameChatThreadFunction: FunctionDeclaration = {
  name: 'renameChatThread',
  description: 'Renames the current chat thread. Use this to give the thread a more descriptive title based on the topic of conversation (e.g., "Login Page Implementation", "Debugging API Error").',
  parameters: {
    type: Type.OBJECT,
    properties: {
      newTitle: {
        type: Type.STRING,
        description: 'The new title for the chat thread.',
      },
    },
    required: ['newTitle'],
  },
};

// --- Aggregated Declarations ---

export const declarations = [
    renameChatThreadFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ getActiveThread, updateThread }: Pick<ToolImplementationsDependencies, 'getActiveThread' | 'updateThread'>) => ({
    renameChatThread: async (args: { newTitle: string }) => {
        const activeThread = getActiveThread();
        if (!activeThread) {
            throw new Error("No active thread to rename.");
        }
        if (!args.newTitle || typeof args.newTitle !== 'string') {
             throw new Error("Invalid title provided.");
        }

        updateThread(activeThread.id, { title: args.newTitle });
        // Also update in DB immediately for persistence
        await db.threads.update(activeThread.id, { title: args.newTitle });

        return { success: true, message: `Chat thread renamed to "${args.newTitle}".` };
    },
});
