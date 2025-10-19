import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

export const thinkFunction: FunctionDeclaration = {
  name: 'think',
  description: "Externalize your thought process, analysis, and plan. This is your internal monologue. Use it to break down a problem, list the steps you'll take, and explain your reasoning before executing other tools. This tool simply returns its input.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      thought: {
        type: Type.STRING,
        description: 'Your detailed thought process, analysis of the situation, and plan of action.',
      },
    },
    required: ['thought'],
  },
};

export const createTaskPlanFunction: FunctionDeclaration = {
  name: 'createTaskPlan',
  description: "Creates a formal, structured plan for a multi-step task and stores it in short-term memory under 'active_task'. This MUST be called at the beginning of any complex task.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      goal: { type: Type.STRING, description: "A one-sentence description of the user's high-level objective." },
      steps: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "An array of strings, where each string is a clear, actionable step in the plan."
      },
    },
    required: ['goal', 'steps'],
  },
};

export const viewTaskPlanFunction: FunctionDeclaration = {
  name: 'viewTaskPlan',
  description: "Retrieves the currently active task plan from short-term memory. Use this to orient yourself at the beginning of each turn.",
};

export const updateTaskStatusFunction: FunctionDeclaration = {
  name: 'updateTaskStatus',
  description: 'Updates the status of a specific step in the current task plan.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      step_index: { type: Type.INTEGER, description: 'The zero-based index of the step to update.' },
      status: {
        type: Type.STRING,
        description: "The new status for the step.",
        enum: ['in-progress', 'complete', 'failed', 'blocked'],
      },
      notes: { type: Type.STRING, description: 'Optional. Any notes about the update, such as an error message for a "failed" status.' },
    },
    required: ['step_index', 'status'],
  },
};

export const completeTaskFunction: FunctionDeclaration = {
  name: 'completeTask',
  description: "The correct tool to call when a task is finished. It cleans up only the active task details ('active_task', 'active_protocols') from memory, preserving all other context for subsequent related tasks. This is the standard final step for MOST tasks.",
};


// --- Aggregated Declarations ---

export const declarations = [
    thinkFunction,
    createTaskPlanFunction,
    viewTaskPlanFunction,
    updateTaskStatusFunction,
    completeTaskFunction,
];

// --- Implementations Factory ---

export const getImplementations = (deps: ToolImplementationsDependencies) => {
    const { getActiveThread, updateThread } = deps;
    const ensureThread = () => {
        const activeThread = getActiveThread();
        if (!activeThread) throw new Error("No active thread found. Cannot manage task plan.");
        return activeThread;
    };
    
    return {
        think: async (args: { thought: string }) => {
            console.log(`[AI Thought] ${args.thought}`);
            return { thought: args.thought };
        },

        createTaskPlan: async (args: { goal: string; steps: string[] }) => {
            // --- VALIDATION START ---
            if (!args.goal || typeof args.goal !== 'string') {
                throw new Error("Validation failed: The 'goal' parameter must be a non-empty string.");
            }
            if (!args.steps || !Array.isArray(args.steps) || args.steps.length === 0) {
                throw new Error("Validation failed: The 'steps' parameter must be a non-empty array of strings.");
            }
            if (args.steps.some(step => typeof step !== 'string')) {
                throw new Error("Validation failed: Each item in the 'steps' array must be a string.");
            }
            // --- VALIDATION END ---

            const thread = ensureThread();
            const task = {
                goal: args.goal,
                steps: args.steps.map((step, index) => ({
                    step: `${index + 1}. ${step}`,
                    status: 'pending',
                })),
                status: 'in-progress',
            };
            const now = Date.now();
            updateThread(thread.id, {
                shortTermMemory: {
                    ...thread.shortTermMemory,
                    'active_task': { value: task, priority: 'high', createdAt: now, lastAccessedAt: now },
                },
            });
            return { success: true, message: "Task plan created in short-term memory." };
        },

        viewTaskPlan: async () => {
            const thread = ensureThread();
            const task = thread.shortTermMemory?.['active_task']?.value;
            if (!task) return { task: null, message: "No active task found." };
            return { task };
        },

        updateTaskStatus: async (args: { step_index: number; status: string; notes?: string }) => {
            const thread = ensureThread();
            const taskMemoryItem = thread.shortTermMemory?.['active_task'];
            if (!taskMemoryItem || taskMemoryItem.value.status !== 'in-progress') {
                throw new Error("No active task to update.");
            }

            const task = taskMemoryItem.value;
            
            // --- VALIDATION START ---
            if (typeof args.step_index !== 'number' || args.step_index < 0 || args.step_index >= task.steps.length) {
                throw new Error(`Validation failed: Invalid step_index ${args.step_index}. Must be a number between 0 and ${task.steps.length - 1}.`);
            }
            const validStatuses = ['in-progress', 'complete', 'failed', 'blocked'];
            if (typeof args.status !== 'string' || !validStatuses.includes(args.status)) {
                throw new Error(`Validation failed: The 'status' parameter must be one of: ${validStatuses.join(', ')}.`);
            }
            // --- VALIDATION END ---
            
            task.steps[args.step_index].status = args.status;
            if (args.notes) {
                task.steps[args.step_index].notes = args.notes;
            }

            taskMemoryItem.lastAccessedAt = Date.now();
            updateThread(thread.id, { shortTermMemory: { ...thread.shortTermMemory, 'active_task': taskMemoryItem } });

            return { success: true, message: `Step ${args.step_index + 1} status updated to ${args.status}.` };
        },
        
        completeTask: async () => {
            const thread = ensureThread();
            const memory = thread.shortTermMemory;
            const keysToRemove = ['active_task', 'active_protocols'];
            const removedKeys: string[] = [];

            if (memory) {
                const newMemory = { ...memory };
                for (const key of keysToRemove) {
                    if (newMemory[key]) {
                        delete newMemory[key];
                        removedKeys.push(key);
                    }
                }
                updateThread(thread.id, { shortTermMemory: newMemory });
            }
            return { success: true, message: `Task complete. The following keys have been cleared from memory: ${removedKeys.join(', ')}.` };
        },
    };
};