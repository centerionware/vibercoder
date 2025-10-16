// FIX: Recreated the `useAiChat` hook. This file was missing, causing build errors. The new content provides the core logic for handling text-based AI chat sessions, including sending messages, processing streaming responses, and orchestrating multi-step tool calls, while correctly interacting with the Gemini API.
import { useState, useRef, useCallback } from 'react';
import { Part } from '@google/genai';

import { UseAiChatProps, GeminiFunctionCall } from '../types';
import { createChatSession } from './useAiChat/chatSessionManager';
import { startTurn, updateTurn, finalizeTurn } from './useAiChat/turnManager';
import { executeTools } from './useAiChat/toolExecutor';
import { processStream } from './useAiChat/streamProcessor';
import { TurnState } from './useAiChat/types';

export const useAiChat = (props: UseAiChatProps) => {
  const { onStartAiRequest, onEndAiRequest } = props;
  const [isResponding, setIsResponding] = useState(false);
  const turnStateRef = useRef<TurnState>({ toolCalls: [], modelMessageId: null, textContent: '' });
  
  const sendMessage = useCallback(async (message: string, isSystemMessage: boolean = false) => {
    if (isResponding) return;

    setIsResponding(true);
    onStartAiRequest();
    startTurn({ ...props, turnStateRef, userMessage: message, isSystemMessage });

    try {
      const chat = await createChatSession(props);
      
      let safetyStop = 5; // Prevent infinite loops
      let stream = await chat.sendMessageStream({ message });

      while (safetyStop > 0) {
        safetyStop--;

        const { accumulatedText, functionCalls } = await processStream({
          stream,
          onChunk: (text, functionCallUpdate) => {
            updateTurn({ ...props, turnStateRef, textUpdate: text, functionCallUpdate: functionCallUpdate as GeminiFunctionCall[] | null });
          },
        });
        
        turnStateRef.current.textContent = accumulatedText;
        updateTurn({ ...props, turnStateRef, textUpdate: null, functionCallUpdate: null });

        if (functionCalls && functionCalls.length > 0) {
          const toolResponseParts = await executeTools({
            ...props,
            functionCalls,
            turnStateRef,
          });
          
          // FIX: The parameter for sending multi-part content (like tool responses) to the chat stream is 'message', not 'parts'.
          stream = await chat.sendMessageStream({ message: toolResponseParts });
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
      finalizeTurn({ ...props, turnStateRef });
      setIsResponding(false);
      onEndAiRequest();
    }
  }, [isResponding, props, onStartAiRequest, onEndAiRequest]);

  return { isResponding, sendMessage };
};