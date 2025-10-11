import { useState, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Chat, Part, GenerationConfig } from '@google/genai';
import { AiMessage, ToolCall, ToolCallStatus, GeminiFunctionCall, GeminiContent, UseAiChatProps } from '../types';
import { allTools, systemInstruction } from '../services/toolOrchestrator';

export const useAiChat = ({
    aiRef,
    settings,
    activeThread,
    toolImplementations,
    addMessage,
    updateMessage,
    updateHistory
}: UseAiChatProps) => {
    const [isResponding, setIsResponding] = useState(false);

    // Refs to manage state across a single, multi-step model turn
    const toolCallsForTurnRef = useRef<ToolCall[]>([]);
    const modelMessageIdForTurnRef = useRef<string | null>(null);
    const contentForTurnRef = useRef<string>('');

    const handleSendMessage = useCallback(async (message: string) => {
        const ai = aiRef.current;
        if (!ai || isResponding || !activeThread) return;
        
        setIsResponding(true);
        // Reset turn-specific state
        toolCallsForTurnRef.current = [];
        contentForTurnRef.current = '';
        
        const userMessage: AiMessage = { id: uuidv4(), role: 'user', content: message };
        addMessage(userMessage);

        // Create a new chat session for each message to ensure no stale state.
        const config: GenerationConfig & { systemInstruction?: any; tools?: any; } = {
            systemInstruction: systemInstruction,
            tools: [{ functionDeclarations: allTools }]
        };

        if (settings.aiModel === 'gemini-2.5-flash' && typeof settings.thinkingBudget === 'number' && settings.thinkingBudget >= 0) {
            config.thinkingConfig = { thinkingBudget: settings.thinkingBudget };
            // As per guidelines, maxOutputTokens must be set if thinkingBudget is used.
            // We'll set it to a generous value to avoid cutting off responses.
            config.maxOutputTokens = settings.thinkingBudget + 2048; 
        }

        const chat: Chat = ai.chats.create({
            model: settings.aiModel,
            history: activeThread.history,
            config: config,
        });
        
        // Create a single message for the entire model turn
        modelMessageIdForTurnRef.current = uuidv4();
        addMessage({ id: modelMessageIdForTurnRef.current, role: 'model', content: '', thinking: 'Thinking...' });

        const MAX_TOOL_LOOPS = 10;
        let loopCount = 0;
        let stream = await chat.sendMessageStream({ message });

        while (loopCount < MAX_TOOL_LOOPS) {
            loopCount++;

            let functionCallsFromChunk: GeminiFunctionCall[] = [];
            
            for await (const chunk of stream) {
                if (chunk.text) {
                    contentForTurnRef.current += chunk.text;
                }
                if (chunk.functionCalls) {
                    functionCallsFromChunk.push(...chunk.functionCalls);
                }
                updateMessage(modelMessageIdForTurnRef.current!, {
                    content: contentForTurnRef.current,
                    thinking: functionCallsFromChunk.length > 0 ? "Thinking about tools..." : isResponding ? "Thinking..." : null,
                    toolCalls: toolCallsForTurnRef.current,
                    usageMetadata: chunk.usageMetadata
                });
            }
            
            const completeFunctionCalls = functionCallsFromChunk.filter(fc => fc.name && fc.args);

            if (completeFunctionCalls.length === 0) {
                break; // End of turn, no more tools to call
            }

            const newToolCallsForUi: ToolCall[] = completeFunctionCalls.map(fc => ({
                id: fc.id || uuidv4(),
                name: fc.name!,
                args: fc.args,
                status: ToolCallStatus.IN_PROGRESS,
            }));
            
            toolCallsForTurnRef.current.push(...newToolCallsForUi);
            updateMessage(modelMessageIdForTurnRef.current!, { toolCalls: toolCallsForTurnRef.current, thinking: "Executing tools..." });

            const toolResponseParts: Part[] = await Promise.all(
                completeFunctionCalls.map(async (fc, index) => {
                    const uiToolCall = newToolCallsForUi[index];
                    try {
                        const toolFn = (toolImplementations as any)[fc.name!];
                        if (!toolFn) throw new Error(`Tool "${fc.name}" not found.`);
                        
                        const result = await toolFn(fc.args);

                        if (fc.name === 'generateImage' && result.base64Image) {
                            updateMessage(modelMessageIdForTurnRef.current!, { attachments: [{ type: 'image', data: result.base64Image }] });
                        }
                        if (fc.name === 'generateVideo' && result.downloadUrl) {
                            updateMessage(modelMessageIdForTurnRef.current!, { attachments: [{ type: 'video', data: result.downloadUrl }] });
                        }
                        
                        toolCallsForTurnRef.current = toolCallsForTurnRef.current.map(tc => tc.id === uiToolCall.id ? { ...tc, status: ToolCallStatus.SUCCESS } : tc);
                        updateMessage(modelMessageIdForTurnRef.current!, { toolCalls: toolCallsForTurnRef.current });

                        return { functionResponse: { name: fc.name!, response: { content: result } } };
                    } catch (e) {
                        console.error(`Error executing tool ${fc.name}:`, e);
                        const error = e instanceof Error ? e.message : String(e);

                        toolCallsForTurnRef.current = toolCallsForTurnRef.current.map(tc => tc.id === uiToolCall.id ? { ...tc, status: ToolCallStatus.ERROR } : tc);
                        updateMessage(modelMessageIdForTurnRef.current!, { toolCalls: toolCallsForTurnRef.current });
                        
                        return { functionResponse: { name: fc.name!, response: { error } } };
                    }
                })
            );
            
            if (contentForTurnRef.current.trim().length > 0 && !contentForTurnRef.current.endsWith('\n\n')) {
                contentForTurnRef.current += '\n\n';
            }

            stream = await chat.sendMessageStream({ message: toolResponseParts });
        }
        
        if (loopCount >= MAX_TOOL_LOOPS) {
            console.warn("Max tool loops reached. Breaking.");
            contentForTurnRef.current += "\n\nIt looks like I'm stuck in a loop. I'll stop for now. Please try rephrasing your request.";
        }
        
        // Final, robust update to ensure all state is persisted correctly.
        if (modelMessageIdForTurnRef.current) {
            updateMessage(modelMessageIdForTurnRef.current, { 
                thinking: null,
                content: contentForTurnRef.current,
                toolCalls: toolCallsForTurnRef.current
            });
        }
        
        // Update the history with the complete conversation from the session.
        // FIX: Cast the result of getHistory() to GeminiContent[] to match the expected type.
        // The Gemini SDK returns a role of `string`, but in a chat context it will always be 'user' or 'model'.
        updateHistory((await chat.getHistory()) as GeminiContent[]);

        setIsResponding(false);
    }, [aiRef, isResponding, activeThread, settings, addMessage, updateMessage, updateHistory, toolImplementations]);

    return { isResponding, handleSendMessage };
};