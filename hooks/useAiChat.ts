// FIX: Recreated the `useAiChat` hook. This file was missing, causing build errors. The new content provides the core logic for handling text-based AI chat sessions, including sending messages, processing streaming responses, and orchestrating multi-step tool calls, while correctly interacting with the Gemini API.
import { useState, useRef, useCallback } from 'react';
import { Part, GenerateContentResponse } from '@google/genai';

import { UseAiChatProps, GeminiFunctionCall } from '../types';
import { createChatSession } from './useAiChat/chatSessionManager';
import { startTurn, updateTurn, finalizeTurn } from './useAiChat/turnManager';
import { executeTools } from './useAiChat/toolExecutor';
import { processStream } from './useAiChat/streamProcessor';
import { TurnState } from './useAiChat/types';

export const useAiChat = (props: UseAiChatProps) => {
  const { onStartAiRequest, onEndAiRequest } = props;
  const [isResponding, setIsResponding] = useState(false);
  const turnStateRef = useRef<TurnState>({ toolCalls: [], modelMessageId: null, textContent: '', thinkingContent: '' });
  
  const sendMessage = useCallback(async (message: string, isSystemMessage: boolean = false) => {
    if (isResponding) return;

    setIsResponding(true);
    onStartAiRequest();
    startTurn({ ...props, turnStateRef, userMessage: message, isSystemMessage });

    let totalTokensForTurn = 0;

    try {
      const chat = await createChatSession(props);
      
      let safetyStop = 10; // Prevent infinite loops
      let nextMessage: string | Part[] = message;

      while (safetyStop > 0) {
        safetyStop--;

        const result = await chat.sendMessageStream({ message: nextMessage });
        const { accumulatedText, functionCalls, fullResponse } = await processStream({
          stream: result,
          onChunk: (text, functionCallUpdate) => {
            updateTurn({ ...props, turnStateRef, textUpdate: text, functionCallUpdate: functionCallUpdate as GeminiFunctionCall[] | null });
          },
        });
        
        totalTokensForTurn += fullResponse.usageMetadata?.totalTokenCount || 0;
        
        turnStateRef.current.textContent = accumulatedText;
        updateTurn({ ...props, turnStateRef, textUpdate: null, functionCallUpdate: null });

        if (functionCalls && functionCalls.length > 0) {
          const toolResponseParts = await executeTools({
            ...props,
            functionCalls,
            turnStateRef,
          });
          nextMessage = toolResponseParts;
        } else {
          break; // No more tool calls, exit loop
        }
      }
      
      if (safetyStop === 0) {
          console.error("AI turn safety stop triggered. Max tool loops exceeded.");
          turnStateRef.current.textContent += "\n\n**Error:** Maximum tool execution limit reached.";
      }

    } catch (e) {
      console.error('Error during AI chat:', e);
      const errorMsg = e instanceof Error ? e.message : 'An unknown error occurred.';
      if (turnStateRef.current.modelMessageId) {
        props.updateMessage(turnStateRef.current.modelMessageId, {
          content: `**Error:** ${errorMsg}`,
          thinking: null,
        });
      }
    } finally {
      finalizeTurn({ ...props, turnStateRef, tokenCount: totalTokensForTurn });
      setIsResponding(false);
      onEndAiRequest();
    }
  }, [isResponding, props, onStartAiRequest, onEndAiRequest]);

  return { isResponding, sendMessage };
};