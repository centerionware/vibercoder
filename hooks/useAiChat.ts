import { useState, useRef, useCallback } from 'react';
// FIX: Add GeminiContent to imports to satisfy the type casting for updateHistory.
import { GeminiContent, UseAiChatProps } from '../../types';
import { createChatSession } from './useAiChat/chatSessionManager';
import { processStream } from './useAiChat/streamProcessor';
import { executeTools } from './useAiChat/toolExecutor';
import { startTurn, updateTurn, finalizeTurn } from './useAiChat/turnManager';
import { TurnState } from './useAiChat/types';

export const useAiChat = (props: UseAiChatProps) => {
    const { aiRef, activeThread, addMessage, updateHistory } = props;
    const [isResponding, setIsResponding] = useState(false);

    // This ref now holds all the state for a single, complex model turn.
    const turnStateRef = useRef<TurnState>({
        toolCalls: [],
        modelMessageId: null,
        textContent: '',
    });

    const handleSendMessage = useCallback(async (message: string) => {
        const ai = aiRef.current;
        if (!ai || isResponding || !activeThread) return;
        
        setIsResponding(true);
        
        startTurn({ turnStateRef, addMessage, userMessage: message });
        
        const chat = await createChatSession(props);
        let stream = await chat.sendMessageStream({ message });

        const MAX_TOOL_LOOPS = 10;
        let loopCount = 0;

        while (loopCount < MAX_TOOL_LOOPS) {
            loopCount++;

            const { accumulatedText, functionCalls } = await processStream({
                stream,
                onChunk: (text, fcs) => {
                    // Provide real-time UI updates as the stream arrives
                    updateTurn({ turnStateRef, ...props, textUpdate: text, functionCallUpdate: fcs });
                }
            });

            // After the stream is done, add the final text to our turn's content
            turnStateRef.current.textContent += accumulatedText;
            
            if (functionCalls.length === 0) {
                break; // No more tools to call, exit the loop.
            }
            
            // Append a newline if there was text before the tool call
            if (turnStateRef.current.textContent.trim().length > 0 && !turnStateRef.current.textContent.endsWith('\n\n')) {
                turnStateRef.current.textContent += '\n\n';
            }

            const toolResponseParts = await executeTools({
                functionCalls,
                turnStateRef,
                ...props
            });
            
            stream = await chat.sendMessageStream({ message: toolResponseParts });
        }

        if (loopCount >= MAX_TOOL_LOOPS) {
            turnStateRef.current.textContent += "\n\nI seem to be stuck in a loop. I'll stop for now. Please try rephrasing your request.";
        }
        
        finalizeTurn({ turnStateRef, ...props });
        
        // Persist the full conversation history for the next turn
        // FIX: Cast the result of getHistory() to GeminiContent[] to match the stricter local type.
        updateHistory((await chat.getHistory()) as GeminiContent[]);

        setIsResponding(false);

    }, [aiRef, isResponding, activeThread, addMessage, updateHistory, props]);

    return { isResponding, handleSendMessage };
};