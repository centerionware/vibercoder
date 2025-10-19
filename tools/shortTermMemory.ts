import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, ShortTermMemory } from '../types';
import { db } from '../utils/idb';

// --- Function Declarations ---

export const viewShortTermMemoryFunction: FunctionDeclaration = {
  name: 'viewShortTermMemory',
  description: 'View the entire contents of your short-term memory. This is your working context for the current task.',
};

export const readShortTermMemoryFunction: FunctionDeclaration = {
  name: 'readShortTermMemory',
  description: 'Retrieve the value of a single item from your short-term memory by its key.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: { type: Type.STRING, description: 'The key of the memory item to retrieve.' },
    },
    required: ['key'],
  },
};

export const updateShortTermMemoryFunction: FunctionDeclaration = {
  name: 'updateShortTermMemory',
  description: "Add or update an item in your short-term memory. Use this to remember key information like the current task, important file paths, or user preferences. Use keys like 'current_task', 'relevant_files', 'user_goal', 'active_protocols'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: { type: Type.STRING, description: 'The key for the memory item (e.g., "current_task").' },
      value: { 
        type: Type.STRING, 
        description: 'The value to store. For complex data like objects or arrays, this MUST be a JSON string (e.g., JSON.stringify({ step: 1, status: "pending" })).' 
      },
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
  description: 'Remove one or more items from your short-term memory when they are no longer relevant, such as at the end of a task.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      keys: { 
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: 'An array of keys for the memory items to remove.' 
      },
    },
    required: ['keys'],
  },
};

export const wipeAllWorkingMemoryFunction: FunctionDeclaration = {
    name: 'wipeAllWorkingMemory',
    description: 'CRITICAL ACTION: Wipes all items from short-term memory. This is a destructive action that erases all working context. Only use this for a major context switch (e.g., starting a completely new, unrelated project), NOT for completing a standard task. For standard task completion, you MUST use the \'completeTask\' tool.',
};

// --- Aggregated Declarations ---

export const declarations = [
    viewShortTermMemoryFunction,
    readShortTermMemoryFunction,
    updateShortTermMemoryFunction,
    removeFromShortTermMemoryFunction,
    wipeAllWorkingMemoryFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ getActiveThread, updateThread }: Pick<ToolImplementationsDependencies, 'getActiveThread' | 'updateThread'>) => {
    
    const ensureThread = () => {
        const activeThread = getActiveThread();
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
        readShortTermMemory: async (args: { key: string }) => {
            const thread = ensureThread();
            const { key } = args;
            if (!key || typeof key !== 'string') {
                throw new Error("Validation failed: The 'key' parameter must be a non-empty string.");
            }
            
            const memoryItem = thread.shortTermMemory?.[key];
            if (!memoryItem) {
                throw new Error(`Key "${key}" not found in short-term memory.`);
            }

            // Update lastAccessedAt for the accessed key
            memoryItem.lastAccessedAt = Date.now();
            updateThread(thread.id, { shortTermMemory: { ...thread.shortTermMemory } });
            
            return { value: memoryItem.value };
        },
        updateShortTermMemory: async (args: { key: string; value: string; priority?: 'low' | 'medium' | 'high' }) => {
            const thread = ensureThread();
            const { key, value, priority = 'medium' } = args;

            // --- VALIDATION START ---
            if (!key || typeof key !== 'string') {
                throw new Error("Validation failed: The 'key' parameter must be a non-empty string.");
            }
            if (typeof value === 'undefined') {
                throw new Error("Validation failed: The 'value' parameter is required.");
            }
            const validPriorities = ['low', 'medium', 'high'];
            if (priority && !validPriorities.includes(priority)) {
                throw new Error(`Validation failed: The 'priority' parameter must be one of: ${validPriorities.join(', ')}.`);
            }
            // --- VALIDATION END ---
            
            const now = Date.now();
            
            let parsedValue: any;
            try {
                // Try to parse the value in case it's a JSON string.
                parsedValue = JSON.parse(value);
            } catch (e) {
                // If parsing fails, it's just a plain string.
                parsedValue = value;
            }

            const newMemory: ShortTermMemory = {
                ...thread.shortTermMemory,
                [key]: {
                    value: parsedValue,
                    priority,
                    createdAt: thread.shortTermMemory?.[key]?.createdAt || now,
                    lastAccessedAt: now,
                },
            };
            
            updateThread(thread.id, { shortTermMemory: newMemory });
            return { success: true, key, value: parsedValue };
        },
        removeFromShortTermMemory: async (args: { keys: string[] }) => {
            const thread = ensureThread();
            const { keys } = args;

            if (!Array.isArray(keys)) {
                throw new Error("The 'keys' parameter must be an array of strings.");
            }

            if (!thread.shortTermMemory) {
                return { success: true, removedKeys: [] };
            }

            const newMemory = { ...thread.shortTermMemory };
            const removedKeys: string[] = [];

            for (const key of keys) {
                if (newMemory[key]) {
                    delete newMemory[key];
                    removedKeys.push(key);
                }
            }

            updateThread(thread.id, { shortTermMemory: newMemory });
            return { success: true, removedKeys };
        },
        wipeAllWorkingMemory: async () => {
            const thread = ensureThread();
            updateThread(thread.id, { shortTermMemory: {} });
            return { success: true, message: "Short-term memory has been cleared." };
        }
    };
};