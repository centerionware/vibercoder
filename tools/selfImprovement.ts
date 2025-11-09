import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

export const initiateSelfImprovementCycleFunction: FunctionDeclaration = {
  name: 'initiateSelfImprovementCycle',
  description: 'Initiates a recursive self-improvement cycle. The AI will analyze its own source code, identify an area for improvement, implement the change, and then finalize it. This is a high-level, autonomous task.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const declarations = [
    initiateSelfImprovementCycleFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ files }: Pick<ToolImplementationsDependencies, 'files'>) => ({
    initiateSelfImprovementCycle: async () => {
        // Filter for source code files that the AI can reasonably modify.
        const sourceFiles = Object.keys(files).filter(path => 
            (path.endsWith('.ts') || path.endsWith('.tsx') || path.endsWith('.js') || path.endsWith('.md')) &&
            !path.includes('node_modules') &&
            !path.includes('dist') &&
            !path.includes('www')
        );

        return {
          sourceFiles: sourceFiles,
          nextStep: "You MUST now load and follow the 'self_improvement_protocol' to analyze these files and improve yourself."
        };
    },
});