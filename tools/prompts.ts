import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, Prompt } from '../types';

// --- Function Declarations ---

export const listPromptsFunction: FunctionDeclaration = {
  name: 'listPrompts',
  description: 'List all available prompts in the library that you can read for instructions.',
};

export const readPromptsFunction: FunctionDeclaration = {
  name: 'readPrompts',
  description: 'Read the content of one or more specific prompts from the library. This is how you load your instructions. You can combine multiple prompts to handle complex tasks.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      keys: {
        type: Type.ARRAY,
        items: {
            type: Type.STRING,
        },
        description: 'An array of keys (IDs) for the prompts to read.',
      },
      versionId: {
        type: Type.STRING,
        description: '(Optional) The specific version ID to read for ALL specified prompts. If not provided, the current active version of each prompt is returned.',
      },
    },
    required: ['keys'],
  },
};

export const updatePromptFunction: FunctionDeclaration = {
  name: 'updatePrompt',
  description: "Update a prompt by creating a new version with new content. Use this to refine your instructions or adapt to new requirements. You MUST explain your reasoning for the change in the 'reason' parameter.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      key: {
        type: Type.STRING,
        description: 'The key (ID) of the prompt to update.',
      },
      newContent: {
        type: Type.STRING,
        description: 'The full new content for the prompt.',
      },
      reason: {
        type: Type.STRING,
        description: 'A brief explanation of why you are updating this prompt.',
      },
    },
    required: ['key', 'newContent', 'reason'],
  },
};

// --- Aggregated Declarations ---
export const declarations = [
    listPromptsFunction,
    readPromptsFunction,
    updatePromptFunction,
];

// --- Implementations Factory ---
export const getImplementations = ({ prompts, updatePrompt }: Pick<ToolImplementationsDependencies, 'prompts' | 'updatePrompt'>) => {

    const findPrompt = (key: string): Prompt => {
        const prompt = prompts.find(p => p.id === key);
        if (!prompt) {
            throw new Error(`Prompt with key "${key}" not found.`);
        }
        return prompt;
    }

    return {
        listPrompts: async () => {
            return {
                prompts: prompts.map(p => ({
                    key: p.id,
                    description: p.description,
                    currentVersionId: p.currentVersionId,
                })),
            };
        },
        readPrompts: async (args: { keys: string[]; versionId?: string }) => {
            if (!Array.isArray(args.keys) || args.keys.length === 0) {
                throw new Error("The 'keys' parameter must be a non-empty array of prompt keys.");
            }
            
            const combinedContent: string[] = [];
            const promptsRead: string[] = [];

            for (const key of args.keys) {
                const prompt = findPrompt(key);
                const versionIdToRead = args.versionId || prompt.currentVersionId;
                const version = prompt.versions.find(v => v.versionId === versionIdToRead);
                
                if (!version) {
                    throw new Error(`Version "${versionIdToRead}" not found for prompt "${key}".`);
                }
                
                combinedContent.push(`--- START OF PROTOCOL: ${key} ---\n\n${version.content}\n\n--- END OF PROTOCOL: ${key} ---`);
                promptsRead.push(key);
            }

            return {
                promptsRead,
                combinedContent: combinedContent.join('\n\n'),
            };
        },
        updatePrompt: async (args: { key: string, newContent: string, reason: string }) => {
            const prompt = findPrompt(args.key); // Ensure it exists first
            console.log(`AI is updating prompt "${args.key}". Reason: ${args.reason}`);
            await updatePrompt(args.key, args.newContent, 'ai');
            return { success: true };
        },
    };
};
