import React, { useEffect } from 'react';
import { Modality, GoogleGenAI } from '@google/genai';
import { AppSettings, ChatThread, UseAiLiveProps } from '../../types';
import { allTools } from '../../services/toolOrchestrator';
import { stopAudioProcessing, connectMicrophoneNodes } from './audioManager';
import { playNotificationSound } from '../../utils/audio';
import { LiveSession, SessionRefs, AudioContextRefs } from './types';

const liveSystemInstruction = `You are Vibe, an autonomous AI agent in a real-time voice conversation. Your purpose is to fulfill user requests by executing tools efficiently. **Your responses must be direct and concise. Prioritize action over conversation.** For every new task, you MUST follow this cognitive cycle:

1.  **Orient:** Call \`viewShortTermMemory\` to check for an 'active_task' and 'active_protocols'.
    *   If both exist, you are continuing a task. Use the protocols from your memory to guide your next step. Proceed to step 5.
    *   If they don't exist, you are starting a new task. Proceed to step 2.

2.  **Analyze & Review Skills:** Understand the user's goal from their speech. Call \`listPrompts()\` to see your library of available protocols.

3.  **Select & Load Knowledge:** Based on the user's request, call \`readPrompts()\` with the keys for the most relevant protocol(s) (e.g., 'full_stack_development_protocol').

4.  **Memorize Knowledge:** You MUST immediately call \`updateShortTermMemory()\` to store the full, combined content of the protocols you just read under the key 'active_protocols'. This is your instruction set for the entire task.

5.  **Formulate a Plan:**
    *   If this is a new task, use \`think()\` to create a high-level plan, then call \`updateShortTermMemory()\` to set the 'active_task'.
    *   If continuing a task, use \`think()\` to outline the single, specific next step.

6.  **Execute:** Carry out your plan, following the instructions from your 'active_protocols' in memory.`;


const liveTools = allTools.filter(t => 
    t.name !== 'captureScreenshot' && 
    t.name !== 'enableScreenshotPreview' &&
    t.name !== 'getChatHistory'
);

interface SessionManagerDependencies {
    propsRef: React.RefObject<UseAiLiveProps>;
    stateRef: React.RefObject<{ isLive: boolean; isMuted: boolean; isSpeaking: boolean; isAiTurn: boolean; isVideoStreamEnabled: boolean; }>;
    refs: {
        audioContextRefs: React.RefObject<AudioContextRefs>;
        sessionRefs: React.RefObject<SessionRefs>;
        retryRef: React.RefObject<{ count: number; maxRetries: number; delay: number; timeoutId: number | null; }>;
        isSessionDirty: React.RefObject<boolean>;
    };
    setters: {
        setIsLive: React.Dispatch<React.SetStateAction<boolean>>;
        setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
        setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
        setIsAiTurn: React.Dispatch<React.SetStateAction<boolean>>;
    };
    onMessage: (message: any) => void;
    finalizeTurn: () => void;
    disableVideoStream: () => void;
}

export const createSessionManager = ({
    propsRef, stateRef, refs, setters, onMessage, finalizeTurn, disableVideoStream
}: SessionManagerDependencies) => {
    
    const { audioContextRefs, sessionRefs, retryRef, isSessionDirty } = refs;

    const performStop = React.useCallback(async (options: { isUnmount?: boolean } = {}) => {
        if (!stateRef.current.isLive) return;
        const { isUnmount = false } = options;

        if (retryRef.current) {
            if (retryRef.current.timeoutId) clearTimeout(retryRef.current.timeoutId);
            retryRef.current.timeoutId = null;
            retryRef.current.count = 0;
        }

        isSessionDirty.current = false;
        setters.setIsLive(false);
        disableVideoStream();

        if (!isUnmount) {
            await playNotificationSound('stop', audioContextRefs.current?.output);
        }
        
        setters.setIsMuted(false);
        setters.setIsSpeaking(false);
        setters.setIsAiTurn(false);
        
        sessionRefs.current?.session?.close();
        await stopAudioProcessing(audioContextRefs, sessionRefs, { keepMicActive: false });
        
        if (sessionRefs.current?.liveMessageId) finalizeTurn();

        if (sessionRefs.current) {
            sessionRefs.current = {
                ...sessionRefs.current,
                session: null, sessionPromise: null, liveMessageId: null,
                currentInputTranscription: '', currentOutputTranscription: '',
                currentToolCalls: [], isAiTurn: false, pendingMessageQueue: [], isTurnFinalizing: false,
            };
        }
    }, [stateRef, retryRef, isSessionDirty, setters, disableVideoStream, audioContextRefs, sessionRefs, finalizeTurn]);
    
    const initiateSessionRef = React.useRef<() => void>(() => {});

    const onError = React.useCallback((e: ErrorEvent) => {
        console.error('Live session error:', e);
        const isRetryable = !e.message?.toLowerCase().includes('permission');
        if (isRetryable && retryRef.current && retryRef.current.count < retryRef.current.maxRetries) {
            retryRef.current.count++;
            const delay = retryRef.current.delay * Math.pow(2, retryRef.current.count - 1);
            console.warn(`[AI Live] Retryable error. Reconnect #${retryRef.current.count} in ${delay}ms...`);
            
            if (retryRef.current.timeoutId) clearTimeout(retryRef.current.timeoutId);
            retryRef.current.timeoutId = window.setTimeout(() => {
                if (retryRef.current) retryRef.current.timeoutId = null;
                isSessionDirty.current = false;
                sessionRefs.current?.session?.close();
                if (audioContextRefs.current?.scriptProcessor) {
                    audioContextRefs.current.scriptProcessor.disconnect();
                    audioContextRefs.current.scriptProcessor = null;
                }
                initiateSessionRef.current();
            }, delay);
        } else {
            let userMessage = `An error occurred with the voice session: ${e.message || 'Unknown error'}. Session closed.`;
            if (e.message?.toLowerCase().includes('permission')) {
                userMessage = `AI voice session failed due to a permission error. Check API key validity, "Generative Language API" is enabled, and API key restrictions allow this domain.`;
            } else if (retryRef.current && retryRef.current.count >= retryRef.current.maxRetries) {
                userMessage = `AI voice session failed to reconnect. Check network/service status. Session closed.`;
            }
            propsRef.current?.onPermissionError(userMessage);
            performStop({});
        }
    }, [retryRef, isSessionDirty, sessionRefs, audioContextRefs, propsRef, performStop]);
    
    const createLiveSession = ({ aiRef, settings, activeThread, callbacks }: any) => {
        const ai = aiRef.current;
        if (!ai) return Promise.reject(new Error("AI not initialized."));
        return ai.live.connect({
            model: settings.liveAiModel,
            callbacks,
            config: {
                responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {},
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName || 'Zephyr' } } },
                tools: [{ functionDeclarations: liveTools }], systemInstruction: liveSystemInstruction,
            },
        });
    };

    const initiateSession = React.useCallback(() => {
        const { aiRef, settings, activeThread } = propsRef.current!;
        const onOpen = () => {
            if (retryRef.current) {
                if (retryRef.current.count > 0) {
                    playNotificationSound('reconnect', audioContextRefs.current?.output);
                }
                retryRef.current.count = 0;
                if (retryRef.current.timeoutId) {
                    clearTimeout(retryRef.current.timeoutId);
                    retryRef.current.timeoutId = null;
                }
            }
            connectMicrophoneNodes(audioContextRefs, sessionRefs, stateRef);
        };
        const sessionPromise = createLiveSession({ aiRef, settings, activeThread, callbacks: { onopen: onOpen, onmessage: onMessage, onerror: onError, onclose: () => {} } });
        if (sessionRefs.current) sessionRefs.current.sessionPromise = sessionPromise;
        sessionPromise.then(session => {
            if (sessionRefs.current) sessionRefs.current.session = session;
        }).catch(err => {
            propsRef.current?.onPermissionError("Could not connect to live AI service. Check API key/network.");
            performStop({});
        });
    }, [propsRef, retryRef, audioContextRefs, sessionRefs, stateRef, onMessage, onError, performStop]);
    
    useEffect(() => {
        initiateSessionRef.current = initiateSession;
    });
    
    const hotSwapSession = React.useCallback(() => {
        console.log("[AI Live] Performing session hot-swap...");
        sessionRefs.current?.session?.close();
        if (audioContextRefs.current?.scriptProcessor) {
            audioContextRefs.current.scriptProcessor.disconnect();
            audioContextRefs.current.scriptProcessor = null;
        }
        initiateSession();
    }, [sessionRefs, audioContextRefs, initiateSession]);

    const performPause = React.useCallback((durationInSeconds: number) => {
        if (!stateRef.current.isLive || stateRef.current.isMuted) return;
        setters.setIsMuted(true);
        setTimeout(() => {
            if (stateRef.current.isLive) setters.setIsMuted(false);
        }, durationInSeconds * 1000);
    }, [stateRef, setters]);

    const resetRetryState = () => {
        if(retryRef.current) {
            retryRef.current.count = 0;
            if (retryRef.current.timeoutId) {
                clearTimeout(retryRef.current.timeoutId);
                retryRef.current.timeoutId = null;
            }
        }
    };

    return { initiateSession, performStop, performPause, hotSwapSession, resetRetryState };
};