import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

export const thinkFunction: FunctionDeclaration = {
  name: 'think',
  description: 'Briefly articulate a step-by-step plan for a complex task. This helps you structure your approach before executing other tools. You MUST call this tool before starting any multi-step task.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      plan: {
        type: Type.STRING,
        description: 'A concise, step-by-step plan of the tool calls you will make to accomplish the user\'s request. For example: "1. Read index.html. 2. Read style.css. 3. Propose changes to make the button blue."',
      },
    },
    required: ['plan'],
  },
};

export const declarations = [thinkFunction];

// --- Implementations Factory ---

export const getImplementations = (dependencies: ToolImplementationsDependencies) => ({
  think: async (args: { plan: string }) => {
    // The 'think' tool is a cognitive step for the model.
    // Its primary purpose is to force the model to create and commit to a plan.
    // The implementation doesn't need to do much besides acknowledge the plan.
    console.log(`[AI Plan]:\n${args.plan}`);
    return { success: true, message: 'Plan acknowledged. Proceeding with execution.' };
  },
});