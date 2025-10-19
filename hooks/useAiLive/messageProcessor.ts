import React from 'react';
import { UseAiLiveProps, ToolCall, ToolCallStatus } from '../../types';
import { SessionRefs, AudioContextRefs } from './types';
import { startTurnIfNeeded } from './turnManager';
import { interruptPlayback, playAudioChunk } from './playbackQueue';
import { playNotificationSound } from '../../utils/audio';

// Hook for managing debounced UI updates
export const useUiUpdater = (
    propsRef: React.RefObject<UseAiLiveProps>,
    sessionRefs: React.MutableRefObject<SessionRefs>,
    uiUpdateTimerRef: React.MutableRefObject<number | null>
) => {
    const requestUiUpdate = React.useCallback(() => {
        if (uiUpdateTimerRef.current) return;
        uiUpdateTimerRef.current = window.setTimeout(() => {
            const { liveMessageId, currentInputTranscription, currentOutputTranscription, currentToolCalls, currentThinkingContent } = sessionRefs.current!;
            if (liveMessageId) {
                propsRef.current?.updateMessage(liveMessageId, { content: currentInputTranscription });
                propsRef.current?.updateMessage(`${liveMessageId}-model`, { 
                    content: currentOutputTranscription,
                    toolCalls: [...currentToolCalls],
                    thinkingContent: currentThinkingContent,
                });
            }
            uiUpdateTimerRef.current = null;
        }, 100);
    }, [propsRef, sessionRefs, uiUpdateTimerRef]);

    const cancelUiUpdate = React.useCallback(() => {
        if (uiUpdateTimerRef.current) {
            clearTimeout(uiUpdateTimerRef.current);
            uiUpdateTimerRef.current = null;
        }
    }, [uiUpdateTimerRef]);

    return { requestUiUpdate, cancelUiUpdate };
};

interface MessageProcessorDependencies {
    propsRef: React.RefObject<UseAiLiveProps>;
    sessionRefs: React.MutableRefObject<SessionRefs>;
    ui: {
        requestUiUpdate: () => void;
        cancelUiUpdate: () => void;
        setIsSpeaking: (isSpeaking: boolean) => void;
        setIsAiTurn: (isAiTurn: boolean) => void;
    };
    audioContextRefs: React.MutableRefObject<AudioContextRefs>;
    inactivity: { 
        clearInactivityTimer: () => void;
        startInactivityTimer: () => void;
    };
    stopExecutionRef: React.MutableRefObject<boolean>;
    lastToolChimeTimeRef: React.MutableRefObject<number>;
    isSessionDirty: React.MutableRefObject<boolean>;
    endOfTurnTimerRef: React.MutableRefObject<number | null>;
}

export const createMessageProcessor = (deps: MessageProcessorDependencies) => {
    
    const { propsRef, sessionRefs, ui, audioContextRefs, stopExecutionRef, lastToolChimeTimeRef, inactivity, isSessionDirty, endOfTurnTimerRef } = deps;

    const self = {} as {
      processModelOutput: (message: any) => Promise<void>;
      finalizeTurn: () => void;
    };

    self.finalizeTurn = () => {
        if (!sessionRefs.current) return;
        
        console.log("[AI Live] Finalizing turn.");
        if (!stopExecutionRef.current) { // Don't play sound if user interrupted
            playNotificationSound('ai-stop', audioContextRefs.current?.output);
        }
        sessionRefs.current.isTurnFinalizing = false;

        const queue = [...sessionRefs.current.pendingMessageQueue];
        sessionRefs.current.pendingMessageQueue = [];
        queue.forEach(msg => self.processModelOutput(msg));
        
        if (sessionRefs.current.isAiTurn) {
            sessionRefs.current.isAiTurn = false;
            ui.setIsAiTurn(false);
        }
        
        ui.cancelUiUpdate();
        const { liveMessageId, currentInputTranscription, currentOutputTranscription, currentToolCalls, currentThinkingContent } = sessionRefs.current;
        if (liveMessageId) {
            propsRef.current?.updateMessage(liveMessageId, { content: currentInputTranscription, isLive: false });
            propsRef.current?.updateMessage(`${liveMessageId}-model`, { 
                content: currentOutputTranscription, 
                isLive: false,
                toolCalls: [...currentToolCalls],
                thinkingContent: currentThinkingContent,
            });
            propsRef.current?.onEndAiRequest();
        }

        sessionRefs.current.liveMessageId = null;
        sessionRefs.current.currentInputTranscription = '';
        sessionRefs.current.currentOutputTranscription = '';
        sessionRefs.current.currentThinkingContent = '';
        sessionRefs.current.currentToolCalls = [];

        inactivity.startInactivityTimer();
    };

    self.processModelOutput = async (message: any) => {
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
                let errors: string[] = [];
                try {
                    const toolFn = propsRef.current!.toolImplementations[fc.name!];
                    if (!toolFn) throw new Error(`Tool "${fc.name}" not implemented.`);

                    sessionRefs.current!.currentThinkingContent += `\n- Preparing to execute tool: \`${fc.name}\`...\n`;
                    ui.requestUiUpdate();

                    const result = await toolFn(fc.args);
                    
                    sessionRefs.current!.currentThinkingContent += `- Tool \`${fc.name}\` finished with status: SUCCESS.\n`;

                    if (fc.name === 'think' && result.thought) {
                        sessionRefs.current!.currentThinkingContent += `> ${result.thought.replace(/\n/g, '\n> ')}\n\n`;
                    }
                    ui.requestUiUpdate();

                    const session = await sessionRefs.current?.sessionPromise;
                    if (!session) throw new Error("Live session not available for tool response.");
                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } });
                    status = ToolCallStatus.SUCCESS;
                } catch (e) {
                    const error = e instanceof Error ? e.message : String(e);
                    errors.push(error);

                    sessionRefs.current!.currentThinkingContent += `- Tool \`${fc.name}\` finished with status: ERROR. Reason: ${error}\n`;
                    ui.requestUiUpdate();

                    const session = await sessionRefs.current?.sessionPromise;
                    session?.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: { error } } } });
                    status = ToolCallStatus.ERROR;
                }
                
                sessionRefs.current!.currentToolCalls = sessionRefs.current!.currentToolCalls.map(tc =>
                    tc.id === fc.id ? { ...tc, status, args: { ...tc.args, errors } } : tc
                );
                ui.requestUiUpdate();
            }
        }
    };
    
    const onMessage = (message: any) => {
        if (!sessionRefs.current) return;
        
        isSessionDirty.current = true;
    
        if (message.serverContent?.inputTranscription) {
            inactivity.clearInactivityTimer();
            startTurnIfNeeded(propsRef, sessionRefs, stopExecutionRef);
            const newText = message.serverContent.inputTranscription.text;
            sessionRefs.current!.currentInputTranscription += newText;
            ui.requestUiUpdate();
            return;
        }
    
        if (message.serverContent?.interrupted) {
            // This is the default barge-in interruption. We now ignore it in favor of our more robust wake-word logic.
            return;
        }
    
        const isModelTurnMessage = message.toolCall || message.serverContent?.modelTurn || message.serverContent?.outputTranscription;
        if (isModelTurnMessage) {
            if (sessionRefs.current.isTurnFinalizing) {
                sessionRefs.current.pendingMessageQueue.push(message);
            } else {
                self.processModelOutput(message);
            }
        }
    
        if (message.serverContent?.turnComplete) {
            if (!sessionRefs.current.isTurnFinalizing) {
                sessionRefs.current.isTurnFinalizing = true;
                endOfTurnTimerRef.current = window.setTimeout(
                    () => self.finalizeTurn(), 1000
                );
            }
        }
    };

    return { onMessage, processModelOutput: self.processModelOutput, finalizeTurn: self.finalizeTurn };
};