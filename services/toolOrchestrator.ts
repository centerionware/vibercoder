import * as fileSystem from '../tools/fileSystem';
import * as git from '../tools/git';
import * as creative from '../tools/creative';
import * as appControl from '../tools/appControl';
import * as memory from '../tools/shortTermMemory';
import * as prompts from '../tools/prompts';
import * as chatContext from '../tools/chatContext';
import * as planning from '../tools/planning';
import * as selfReview from '../tools/selfReview';
import * as aiVersioning from '../tools/aiVersioning';

import { ToolImplementationsDependencies } from '../types';

// Aggregate all tool declarations from the different modules.
export const allTools = [
  ...fileSystem.declarations,
  ...git.declarations,
  ...creative.declarations,
  ...appControl.declarations,
  ...memory.declarations,
  ...prompts.declarations,
  ...chatContext.declarations,
  ...planning.declarations,
  ...selfReview.declarations,
  ...aiVersioning.declarations,
];

// The main system instruction for the AI.
export const systemInstruction = `You are Vibe, an expert, autonomous AI agentpair programmer. Your environment is a web-based IDE called VibeCode. You operate in a continuous loop of analyzing user requests and executing tools to fulfill them.

**Core Directives:**
- **Tool-First:** Your primary mode of interaction is through the provided function calling tools. Do not answer questions or perform tasks with text alone if a tool is available.
- **Protocol-Driven:** You have a library of "protocols" (prompts) that define your standard operating procedures. Before starting any complex task, you MUST load the relevant protocol(s) into your short-term memory (e.g., 'lead_engineer_protocol', 'debugging_protocol').
- **Persona-Based Execution:** Your primary protocol is the 'lead_engineer_protocol'. You MUST use it to analyze every new user request and decide which specialized engineering persona (e.g., UI/UX, DevOps, Architect) is best suited for the task. You then adopt that persona by loading its specific protocol into your memory.
- **Silent Operation:** Work silently. Execute tools without announcing what you are about to do. Only provide a textual response when a task is complete or you need to ask a clarifying question.
- **Autonomous & Proactive:** Take initiative. If a user's request is vague, load and follow the 'ambiguity_resolution_protocol'. If you complete a task, consider what the logical next step is (e.g., refactoring, writing tests) and suggest it.`;


// Factory function to create the full suite of tool implementations.
export const createToolImplementations = (deps: ToolImplementationsDependencies) => {
  return {
    ...fileSystem.getImplementations(deps),
    ...git.getImplementations(deps),
    ...creative.getImplementations(deps),
    ...appControl.getImplementations(deps),
    ...memory.getImplementations(deps),
    ...prompts.getImplementations(deps),
    ...chatContext.getImplementations(deps),
    ...planning.getImplementations(deps),
    ...selfReview.getImplementations(deps),
    ...aiVersioning.getImplementations(deps),
  };
};