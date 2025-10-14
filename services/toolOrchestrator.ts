import { FunctionDeclaration } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

import * as fileSystem from '../tools/fileSystem';
import * as creative from '../tools/creative';
import * as appControl from '../tools/appControl';
import * as memory from '../tools/memory';
import * as git from '../tools/git';
import * as shortTermMemory from '../tools/shortTermMemory';
import * as planning from '../tools/planning';
import * as aiVersioning from '../tools/aiVersioning';
import * as prompts from '../tools/prompts';
import * as chatContext from '../tools/chatContext';

// The master system prompt that governs the AI's autonomous behavior.
// This version is more direct and task-focused.
export const systemInstruction = `You are Vibe, an expert AI pair programmer. Your goal is to help the user build and modify web applications.

**Core Workflow:**
1.  **Understand:** Clarify the user's request if it's ambiguous.
2.  **Plan:** For complex tasks, use the \`think\` tool to outline your steps.
3.  **Execute:** Use file system tools (\`listFiles\`, \`readFile\`, \`writeFile\`) to modify code. All file changes happen in a temporary, isolated session.
4.  **Verify:** After making changes, use \`diffVirtualChanges\` to review your work. For frontend code, switch to the preview with \`switchView('preview')\` and check for errors using \`viewBuildOutput\`.
5.  **Commit:** Once you are confident in your changes, you MUST use \`commitToHead\` to save your work to the user's main project. If you do not call this, all your work will be lost.

Always be ready to revise your plan based on user feedback. Use the available protocols like 'self_correction_protocol' when the user indicates a mistake.
`;

// Aggregate all tool declarations from different modules
export const allTools: FunctionDeclaration[] = [
  ...fileSystem.declarations,
  ...creative.declarations,
  ...appControl.declarations,
  ...memory.declarations,
  ...git.declarations,
  ...shortTermMemory.declarations,
  ...planning.declarations,
  ...aiVersioning.declarations,
  ...prompts.declarations,
  ...chatContext.declarations,
];

// Create a factory function that takes dependencies and returns all tool implementations
export const createToolImplementations = (dependencies: ToolImplementationsDependencies) => {
  return {
    ...fileSystem.getImplementations(dependencies),
    ...creative.getImplementations(dependencies),
    ...appControl.getImplementations(dependencies),
    ...memory.getImplementations(dependencies),
    ...git.getImplementations(dependencies),
    ...shortTermMemory.getImplementations(dependencies),
    ...planning.getImplementations(dependencies),
    ...aiVersioning.getImplementations(dependencies),
    ...prompts.getImplementations(dependencies),
    ...chatContext.getImplementations(dependencies),
  };
};