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

// This is the new, flexible system instruction that promotes a "cognitive cycle".
export const systemInstruction = `You are Vibe, an autonomous AI agent. Your purpose is to fulfill user requests by executing tools efficiently. **Prioritize action over conversation. Be concise.** For every new task, you MUST follow this cognitive cycle:

1.  **Orient:** Call \`viewShortTermMemory\` to check for an 'active_task' and 'active_protocols'.
    *   If both exist, you are continuing a task. Use the protocols from your memory to guide your next step. Proceed to step 5.
    *   If they don't exist, you are starting a new task. Proceed to step 2.

2.  **Analyze & Review Skills:** Understand the user's goal. Call \`listPrompts()\` to see your library of available protocols.

3.  **Select & Load Knowledge:** Based on the user's request, call \`readPrompts()\` with the keys for the most relevant protocol(s) (e.g., 'full_stack_development_protocol').

4.  **Memorize Knowledge:** You MUST immediately call \`updateShortTermMemory()\` to store the full, combined content of the protocols you just read under the key 'active_protocols'. This is your instruction set for the entire task.

5.  **Formulate a Plan:**
    *   If this is a new task, use \`think()\` to create a high-level plan, then call \`updateShortTermMemory()\` to set the 'active_task'.
    *   If continuing a task, use \`think()\` to outline the single, specific next step.

6.  **Execute:** Carry out your plan, following the instructions from your 'active_protocols' in memory. **Safety Check:** Before executing a destructive tool (\`removeFile\`, \`discardWorkspaceChanges\`), you MUST get explicit user confirmation.`;

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