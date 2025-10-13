import { useState, useRef, useCallback, useEffect } from 'react';
import { GeminiContent, UseAiChatProps } from '../types';
import { createChatSession } from './useAiChat/chatSessionManager';
import { processStream } from './useAiChat/streamProcessor';
import { executeTools } from './useAiChat/toolExecutor';
import { startTurn, updateTurn, finalizeTurn } from './useAiChat/turnManager';
import { TurnState } from './useAiChat/types';

export const useAiChat = (props: UseAiChatProps) => {
    const [isResponding, setIsResponding] = useState(false);
    const turnStateRef = useRef<TurnState>({
        toolCalls: [],
        modelMessageId: null,
        textContent: '',
    });

    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);

    const handleSendMessage = useCallback(async (message: string) => {
        const initialProps = propsRef.current;
        const { aiRef, activeThread, onStartAiRequest, onEndAiRequest } = initialProps;
        if (!aiRef.current || isResponding || !activeThread) return;
        
        setIsResponding(true);
        onStartAiRequest();
        
        try {
            startTurn({ turnStateRef, addMessage: initialProps.addMessage, userMessage: message });
            
            const chat = await createChatSession(initialProps);
            let stream = await chat.sendMessageStream({ message });

            const MAX_TOOL_LOOPS = 10;
            let loopCount = 0;

            while (loopCount < MAX_TOOL_LOOPS) {
                loopCount++;

                const { accumulatedText, functionCalls } = await processStream({
                    stream,
                    onChunk: (text, fcs) => {
                        updateTurn({ turnStateRef, ...propsRef.current, textUpdate: text, functionCallUpdate: fcs });
                    }
                });

                turnStateRef.current.textContent += accumulatedText;
                
                if (functionCalls.length === 0) {
                    break;
                }
                
                if (turnStateRef.current.textContent.trim().length > 0 && !turnStateRef.current.textContent.endsWith('\n\n')) {
                    turnStateRef.current.textContent += '\n\n';
                }

                const toolResponseParts = await executeTools({
                    functionCalls,
                    turnStateRef,
                    ...propsRef.current
                });
                
                stream = await chat.sendMessageStream({ message: toolResponseParts });
            }

            if (loopCount >= MAX_TOOL_LOOPS) {
                turnStateRef.current.textContent += "\n\nI seem to be stuck in a loop. I'll stop for now. Please try rephrasing your request.";
            }
            
            finalizeTurn({ turnStateRef, ...propsRef.current });
            
            propsRef.current.updateHistory((await chat.getHistory()) as GeminiContent[]);
        } catch (error) {
            console.error("Error during AI chat response:", error);
            const { modelMessageId } = turnStateRef.current;
            if (modelMessageId) {
                const errorMessage = error instanceof Error ? error.message : String(error);
                propsRef.current.updateMessage(modelMessageId, {
                    content: (turnStateRef.current.textContent || "") + `\n\n**An error occurred:** ${errorMessage}`,
                    thinking: null,
                });
            }
        } finally {
            setIsResponding(false);
            onEndAiRequest();
        }

    }, [isResponding]);

    return { isResponding, handleSendMessage };
};