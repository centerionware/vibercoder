import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

export const getChatHistoryFunction: FunctionDeclaration = {
  name: 'getChatHistory',
  description: "Retrieve the message history for the current, active chat thread. Use this to answer questions about the conversation so far, what the user just said, or to get context from previous turns.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      last_n_turns: {
        type: Type.INTEGER,
        description: 'Optional. The number of recent conversational turns to retrieve. A "turn" consists of one user message and its corresponding model response. If omitted, the entire history is returned.',
      },
    },
  },
};

export const declarations: FunctionDeclaration[] = [getChatHistoryFunction];

// --- Implementations Factory ---
export const getImplementations = ({ getActiveThread }: Pick<ToolImplementationsDependencies, 'getActiveThread'>) => ({
  getChatHistory: async (args: { last_n_turns?: number }) => {
    const activeThread = getActiveThread();
    if (!activeThread) {
      throw new Error("No active chat thread found.");
    }

    const messages = activeThread.messages.map(m => ({
        role: m.role,
        content: m.content,
    }));

    if (args.last_n_turns && args.last_n_turns > 0) {
      // Each turn has a user and a model message, so we retrieve last_n_turns * 2 messages.
      const messagesToTake = args.last_n_turns * 2;
      return { history: messages.slice(-messagesToTake) };
    }

    return { history: messages };
  },
});