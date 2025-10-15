
import React, { useCallback, useRef } from 'react';
import { UseAiLiveProps, ToolCall, ToolCallStatus } from '../../types';
import { SessionRefs, AudioContextRefs } from './types';
import { startTurnIfNeeded } from './turnManager';
import { interruptPlayback, playAudioChunk } from './playbackQueue';
import { playNotificationSound } from '../../utils/audio';

// Hook for managing debounced UI updates
export const useUiUpdater = (
    propsRef: React.RefObject<UseAiLiveProps>,
    sessionRefs: React.RefObject<SessionRefs>,
    uiUpdateTimerRef: React.RefObject<number | null>
) => {
    const requestUiUpdate = useCallback(() => {
        if (uiUpdateTimerRef.current) return;
        uiUpdateTimerRef.current = window.setTimeout(() => {
            const { liveMessageId, currentInputTranscription, currentOutputTranscription, currentToolCalls } = sessionRefs.current!;
            if (liveMessageId) {
                propsRef.current?.updateMessage(liveMessageId, { content: currentInputTranscription });
                propsRef.current?.updateMessage(`${liveMessageId}-model`, { 
                    content: currentOutputTranscription,
                    toolCalls: [...currentToolCalls] 
                });
            }
            uiUpdateTimerRef.current = null;
        }, 100);
    }, [propsRef, sessionRefs, uiUpdateTimerRef]);

    const cancelUiUpdate = useCallback(() => {
        if (uiUpdateTimerRef.current) {
            clearTimeout(uiUpdateTimerRef.current);
            uiUpdateTimerRef.current = null;
        }
    }, [uiUpdateTimerRef]);

    return { requestUiUpdate, cancelUiUpdate };
};

interface MessageProcessorDependencies {
    propsRef: React.RefObject<UseAiLiveProps>;
    sessionRefs: React.RefObject<SessionRefs>;
    turnManager: { finalizeTurn: (process: (msg: any) => void) => void };
    ui: {
        requestUiUpdate: () => void;
        setIsSpeaking: (isSpeaking: boolean) => void;
        setIsAiTurn: (isAiTurn: boolean) => void;
    };
    audioContextRefs: React.RefObject<AudioContextRefs>;
    inactivity: { clearInactivityTimer: () => void };
    stopExecutionRef: React.RefObject<boolean>;
    lastToolChimeTimeRef: React.RefObject<number>;
    // FIX: Added refs for `isSessionDirty` and `endOfTurnTimerRef` to dependencies.
    isSessionDirty: React.RefObject<boolean>;
    endOfTurnTimerRef: React.RefObject<number | null>;
}

export const createMessageProcessor = (deps: MessageProcessorDependencies) => {
    
    const processModelOutput = useCallback(async (message: any) => {
        const { propsRef, sessionRefs, ui, audioContextRefs, stopExecutionRef, lastToolChimeTimeRef } = deps;

        if (message.serverContent && !sessionRefs.current?.isAiTurn) {
            sessionRefs.current!.isAiTurn = true;
            ui.setIsAiTurn(true);
            playNotificationSound('thinking', audioContextRefs.current?.output);
        }
    
        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio) {
            await playAudioChunk(base64Audio, audioContextRefs, sessionRefs, ui.setIsSpeaking);
        }
        
        const outputTranscription = message.serverContent?.outputTranscription?.text;
        if (outputTranscription) {
            startTurnIfNeeded(propsRef, sessionRefs, stopExecutionRef);
            sessionRefs.current!.currentOutputTranscription += outputTranscription;
            ui.requestUiUpdate();
        }
    
        if (message.toolCall) {
            const now = Date.now();
            if (now - lastToolChimeTimeRef.current > 2000) {
                playNotificationSound('tool-call', audioContextRefs.current?.output);
                lastToolChimeTimeRef.current = now;
            }
            startTurnIfNeeded(propsRef, sessionRefs, stopExecutionRef);
            const newToolCalls: ToolCall[] = message.toolCall.functionCalls.map((fc: any) => ({
                id: fc.id, name: fc.name, args: fc.args, status: ToolCallStatus.IN_PROGRESS,
            }));
            sessionRefs.current!.currentToolCalls.push(...newToolCalls);
            ui.requestUiUpdate();
    
            for (const fc of message.toolCall.functionCalls) {
                if (stopExecutionRef.current) {
                    sessionRefs.current!.currentToolCalls = sessionRefs.current!.currentToolCalls.map(tc =>
                        tc.status === ToolCallStatus.IN_PROGRESS ? { ...tc, status: ToolCallStatus.CANCELLED } : tc
                    );
                    ui.requestUiUpdate();
                    sessionRefs.current!.currentOutputTranscription += "\n\n*Tool execution cancelled by user.*";
                    break;
                }

                let status: ToolCallStatus;
                try {
                    const toolFn = propsRef.current!.toolImplementations[fc.name!];
                    if (!toolFn) throw new Error(`Tool "${fc.name}" not implemented.`);
                    const result = await toolFn(fc.args);
                    const session = await sessionRefs.current?.sessionPromise;
                    if (!session) throw new Error("Live session not available for tool response.");
                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } });
                    status = ToolCallStatus.SUCCESS;
                } catch (e) {
                    const error = e instanceof Error ? e.message : String(e);
                    const session = await sessionRefs.current?.sessionPromise;
                    session?.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: { error } } } });
                    status = ToolCallStatus.ERROR;
                }
                
                sessionRefs.current!.currentToolCalls = sessionRefs.current!.currentToolCalls.map(tc =>
                    tc.id === fc.id ? { ...tc, status } : tc
                );
                ui.requestUiUpdate();
            }
        }
    }, [deps]);

    const processInputTranscription = useCallback((message: any) => {
        const { propsRef, sessionRefs, ui, inactivity, stopExecutionRef } = deps;
        inactivity.clearInactivityTimer();
        startTurnIfNeeded(propsRef, sessionRefs, stopExecutionRef);
        const newText = message.serverContent.inputTranscription.text;
        const isAiWorking = sessionRefs.current!.currentToolCalls.some(tc => tc.status === ToolCallStatus.IN_PROGRESS);

        if (isAiWorking && /\bstop\b/i.test(newText)) {
            stopExecutionRef.current = true;
        } else {
            sessionRefs.current!.currentInputTranscription += newText;
        }
        ui.requestUiUpdate();
    }, [deps]);

    const onMessage = useCallback((message: any) => {
        // FIX: Destructure `isSessionDirty` and `endOfTurnTimerRef` from dependencies.
        const { sessionRefs, ui, inactivity, turnManager, isSessionDirty, endOfTurnTimerRef } = deps;
        if (!sessionRefs.current) return;
        
        // FIX: Access `isSessionDirty` directly from its ref.
        isSessionDirty.current = true;
    
        if (message.serverContent?.inputTranscription) {
            inactivity.clearInactivityTimer();
            // FIX: Access `endOfTurnTimerRef` directly from its ref.
            if (endOfTurnTimerRef.current) {
                clearTimeout(endOfTurnTimerRef.current);
            }
            sessionRefs.current.isTurnFinalizing = false;
            
            if (sessionRefs.current.pendingMessageQueue.length > 0) {
                sessionRefs.current.pendingMessageQueue = [];
                interruptPlayback(sessionRefs);
                ui.setIsSpeaking(false);
            }
            processInputTranscription(message);
            return;
        }
    
        if (message.serverContent?.interrupted) {
            interruptPlayback(sessionRefs);
            ui.setIsSpeaking(false);
        }
    
        const isModelTurnMessage = message.toolCall || message.serverContent?.modelTurn || message.serverContent?.outputTranscription;
        if (isModelTurnMessage) {
            if (sessionRefs.current.isTurnFinalizing) {
                sessionRefs.current.pendingMessageQueue.push(message);
            } else {
                processModelOutput(message);
            }
        }
    
        if (message.serverContent?.turnComplete) {
            if (!sessionRefs.current.isTurnFinalizing) {
                sessionRefs.current.isTurnFinalizing = true;
                // FIX: Access `endOfTurnTimerRef` directly from its ref.
                endOfTurnTimerRef.current = window.setTimeout(
                    () => turnManager.finalizeTurn(processModelOutput), 1000
                );
            }
        }
    }, [deps, processInputTranscription, processModelOutput]);

    return { onMessage, processModelOutput };
};
