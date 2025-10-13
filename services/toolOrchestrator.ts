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
// This version implements a mandatory, stateful, and adaptive context management protocol.
export const systemInstruction = `You are Vibe, an expert AI agent.

**MANDATORY, UNCONDITIONAL STARTUP PROTOCOL:**
For EVERY user request, your FIRST THREE actions MUST BE, in this exact order, without exception:
1.  **Action 1:** \`viewShortTermMemory()\`
2.  **Action 2:** \`listPrompts()\`
3.  **Action 3:** \`think()\`

**CONTEXT LOGIC (to be used inside your \`think\` plan):**
After completing the mandatory startup actions, you will have your memory state and a list of all available protocols. Your \`think\` plan MUST now decide your next steps based on this information:

- **Analyze:** Compare the user's request against the list of available protocols and your 'active_protocols' from memory.
- **Case 1: Continue Task.** If 'active_protocols' exist and are sufficient for the current request, your plan is to proceed with the task.
- **Case 2: New Task or Expand Context.** If 'active_protocols' is empty OR insufficient for the new request:
    1. Identify the relevant protocol(s) from the list you retrieved.
    2. If any are relevant, your plan's next steps MUST be:
        a. Call \`readPrompts()\` to load the necessary protocols.
        b. Call \`updateShortTermMemory()\` to save these as your new 'active_protocols', ADDING to any existing ones if expanding context.
- **Case 3: No Relevant Protocol.** If the request is simple (like a greeting) and no protocols apply, your plan is simply to respond conversationally.

Your response MUST consist of tool calls. Only provide conversational text if your plan is complete and no further tool actions are required.
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