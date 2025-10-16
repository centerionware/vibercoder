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

// --- Aggregated Declarations ---

export const declarations = [
    thinkFunction
];

// --- Implementations Factory ---

export const getImplementations = (deps: ToolImplementationsDependencies) => ({
    think: async (args: { thought: string }) => {
        // The 'think' tool is a no-op from the system's perspective. 
        // Its purpose is to force the model to output its reasoning
        // in a structured way that we can display in the UI.
        // It simply returns its input.
        // FIX: Corrected a syntax error where single quotes were used with template literal syntax. Changed to backticks to ensure the variable is properly interpolated.
        console.log(`[AI Thought] ${args.thought}`);
        return {
            thought: args.thought
        };
    },
});
