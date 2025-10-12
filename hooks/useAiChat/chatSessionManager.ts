import { Chat, GenerationConfig } from '@google/genai';
import { UseAiChatProps, GeminiContent } from '../../types';
import { allTools, systemInstruction } from '../../services/toolOrchestrator';
import { getImplementations as getMemoryToolImplementations } from '../../tools/shortTermMemory';

/**
 * Creates and configures a new Gemini Chat session based on the current app settings.
 */
export const createChatSession = async ({
  aiRef,
  settings,
  activeThread,
  updateThread,
}: UseAiChatProps): Promise<Chat> => {
  const ai = aiRef.current;
  if (!ai || !activeThread) {
    throw new Error("Cannot create chat session: AI not initialized or no active thread.");
  }
  
  // Base configuration with system instructions and tools
  const config: GenerationConfig & { systemInstruction?: any; tools?: any; } = {
    systemInstruction: systemInstruction,
    tools: [{ functionDeclarations: allTools }]
  };

  // Add model-specific configurations
  if (settings.aiModel === 'gemini-2.5-flash' && typeof settings.thinkingBudget === 'number' && settings.thinkingBudget >= 0) {
    config.thinkingConfig = { thinkingBudget: settings.thinkingBudget };
    // As per guidelines, maxOutputTokens must also be set.
    // We set a generous value to avoid cutting off responses unexpectedly.
    config.maxOutputTokens = settings.thinkingBudget + 4096;
  }

  // Create a temporary instance of memory tools to fetch current state.
  const memoryTools = getMemoryToolImplementations({ activeThread, updateThread });
  const { memory: currentMemory } = await memoryTools.viewShortTermMemory();
  const hasMemory = currentMemory && Object.keys(currentMemory).length > 0;

  // Construct a new, clean history for this turn that is based ONLY on short-term memory.
  const memoryContext: GeminiContent[] = hasMemory ? [
    {
        role: 'user',
        parts: [{ text: `This is an automated context message. Your entire context for this turn is provided by the contents of your short-term memory below. You MUST ignore all previous turns in the chat history and base your actions solely on this memory and the user's new prompt.

Your Current Memory:
${JSON.stringify(currentMemory, null, 2)}`}]
    },
    {
        role: 'model',
        parts: [{ text: `Understood. My context is now reset to the provided memory state. I will proceed based on this information and the user's request.` }]
    }
  ] : []; // If memory is empty, start with a blank slate.


  // Create the chat instance with the memory-only history and configuration
  const chat: Chat = ai.chats.create({
    model: settings.aiModel,
    history: memoryContext,
    config: config,
  });

  return chat;
};