import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

export const initiateSelfReviewFunction: FunctionDeclaration = {
  name: 'initiateSelfReview',
  description: 'Initiates an internal, multi-persona code review cycle for the changes made in the current VFS session. This MUST be called before committing work.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      personas: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: "An array of prompt keys for the personas to use in the review (e.g., ['senior_software_architect_protocol', 'quality_assurance_engineer_protocol']).",
      },
    },
    required: ['personas'],
  },
};

export const advanceSelfReviewFunction: FunctionDeclaration = {
  name: 'advanceSelfReview',
  description: 'Advances the internal code review cycle to the next persona or concludes it if all personas have completed their review.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const declarations = [initiateSelfReviewFunction, advanceSelfReviewFunction];

export const getImplementations = ({ getActiveThread, updateThread }: Pick<ToolImplementationsDependencies, 'getActiveThread' | 'updateThread'>) => {
    
    const ensureThread = () => {
        const activeThread = getActiveThread();
        if (!activeThread) throw new Error("No active thread found. Cannot manage self-review cycle.");
        return activeThread;
    };

    return {
        initiateSelfReview: async (args: { personas: string[] }) => {
            const thread = ensureThread();
            if (!Array.isArray(args.personas) || args.personas.length === 0) {
                throw new Error("The 'personas' argument must be a non-empty array of persona keys.");
            }
            const reviewTask = {
                goal: 'Perform an internal peer review of the current code changes.',
                personas: args.personas,
                current_persona_index: 0,
                status: 'in-progress',
            };
            
            updateThread(thread.id, {
                shortTermMemory: {
                    ...thread.shortTermMemory,
                    'active_review_task': {
                        value: reviewTask,
                        priority: 'high',
                        createdAt: Date.now(),
                        lastAccessedAt: Date.now(),
                    },
                },
            });

            return { success: true, message: `Self-review process initiated. Ready for first review with persona: ${args.personas[0]}.` };
        },
        advanceSelfReview: async () => {
            const thread = ensureThread();
            const reviewTaskMemory = thread.shortTermMemory?.['active_review_task'];

            if (!reviewTaskMemory || reviewTaskMemory.value.status !== 'in-progress') {
                throw new Error("No active self-review task to advance.");
            }

            const reviewTask = reviewTaskMemory.value;
            const newIndex = reviewTask.current_persona_index + 1;

            if (newIndex >= reviewTask.personas.length) {
                // Cycle complete. Remove the task from memory.
                const newMemory = { ...thread.shortTermMemory };
                delete newMemory['active_review_task'];
                updateThread(thread.id, { shortTermMemory: newMemory });
                return { success: true, message: "Final review step complete. Review process concluded." };
            } else {
                // Advance to next persona
                reviewTask.current_persona_index = newIndex;
                reviewTaskMemory.lastAccessedAt = Date.now();
                updateThread(thread.id, { shortTermMemory: { ...thread.shortTermMemory, 'active_review_task': reviewTaskMemory } });
                return { success: true, message: `Review step complete. Advancing to next persona: ${reviewTask.personas[newIndex]}.` };
            }
        },
    };
};