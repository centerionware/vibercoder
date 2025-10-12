import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, ShortTermMemory } from '../types';

// --- Function Declarations ---

export const viewShortTermMemoryFunction: FunctionDeclaration = {
  name: 'viewShortTermMemory',
  description: 'View the contents of your short-term memory. This is your working context for the current task.',
};

export const updateShortTermMemoryFunction: FunctionDeclaration = {
  name: 'updateShortTermMemory',
  description: "Add or update an item in your short-term memory. Use this to remember key information like the current task, important file paths, or user preferences. Use keys like 'current_task', 'relevant_files', 'user_goal'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: { type: Type.STRING, description: 'The key for the memory item (e.g., "current_task").' },
      value: { type: Type.OBJECT, description: 'The value to store. Can be a string, array, or object.' },
      priority: { 
        type: Type.STRING, 
        description: "The importance of the item. Defaults to 'medium'.",
        enum: ['low', 'medium', 'high']
      },
    },
    required: ['key', 'value'],
  },
};

export const removeFromShortTermMemoryFunction: FunctionDeclaration = {
  name: 'removeFromShortTermMemory',
  description: 'Remove an item from your short-term memory when it is no longer relevant.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: { type: Type.STRING, description: 'The key of the memory item to remove.' },
    },
    required: ['key'],
  },
};

// --- Aggregated Declarations ---

export const declarations = [
    viewShortTermMemoryFunction,
    updateShortTermMemoryFunction,
    removeFromShortTermMemoryFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ activeThread, updateThread }: Pick<ToolImplementationsDependencies, 'activeThread' | 'updateThread'>) => {
    
    const ensureThread = () => {
        if (!activeThread) {
            throw new Error("No active thread found. Cannot access short-term memory.");
        }
        return activeThread;
    };

    return {
        viewShortTermMemory: async () => {
            const thread = ensureThread();
            const memory = thread.shortTermMemory || {};
            
            // Update lastAccessedAt for all keys being viewed
            const now = Date.now();
            Object.keys(memory).forEach(key => {
                memory[key].lastAccessedAt = now;
            });
            updateThread(thread.id, { shortTermMemory: memory });

            return { memory };
        },
        updateShortTermMemory: async (args: { key: string; value: any; priority?: 'low' | 'medium' | 'high' }) => {
            const thread = ensureThread();
            const { key, value, priority = 'medium' } = args;
            const now = Date.now();

            const newMemory: ShortTermMemory = {
                ...thread.shortTermMemory,
                [key]: {
                    value,
                    priority,
                    createdAt: thread.shortTermMemory?.[key]?.createdAt || now,
                    lastAccessedAt: now,
                },
            };
            
            updateThread(thread.id, { shortTermMemory: newMemory });
            return { success: true, key, value };
        },
        removeFromShortTermMemory: async (args: { key: string }) => {
            const thread = ensureThread();
            const { key } = args;

            if (!thread.shortTermMemory || !thread.shortTermMemory[key]) {
                throw new Error(`Key "${key}" not found in short-term memory.`);
            }

            const newMemory = { ...thread.shortTermMemory };
            delete newMemory[key];

            updateThread(thread.id, { shortTermMemory: newMemory });
            return { success: true, key };
        },
    };
};