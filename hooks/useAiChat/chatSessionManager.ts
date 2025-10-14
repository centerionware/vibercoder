import { Chat, GenerationConfig } from '@google/genai';
import { UseAiChatProps, GeminiContent } from '../../types';
import { allTools, systemInstruction } from '../../services/toolOrchestrator';

/**
 * Creates and configures a new Gemini Chat session based on the current app settings.
 */
export const createChatSession = async ({
  aiRef,
  settings,
  activeThread,
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

  // The history is now managed exclusively by the AI using its tools.
  // We start every turn with a blank history slate to force the AI to rely on its protocol.
  const history: GeminiContent[] = [];


  // Create the chat instance with a blank history and the new configuration.
  const chat: Chat = ai.chats.create({
    model: settings.aiModel,
    history: history,
    config: config,
  });

  return chat;
};
