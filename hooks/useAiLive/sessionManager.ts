import React from 'react';
import { Modality } from '@google/genai';
import { UseAiLiveProps } from '../../types';
import { stopAudioProcessing, setupScriptProcessor, connectMicSourceToProcessor, disconnectMicSourceFromProcessor } from './audioManager';
import { playNotificationSound } from '../../utils/audio';
import { AudioContextRefs, SessionRefs } from './types';
import { requestMediaPermissions } from '../../utils/permissions';
import { allTools, systemInstruction } from '../../services/toolOrchestrator';

interface SessionManagerDependencies {
    propsRef: React.RefObject<UseAiLiveProps>;
    stateRef: React.RefObject<{ 
        isLive: boolean; 
        isMuted: boolean; 
        isSpeaking: boolean; 
        isAiTurn: boolean; 
        isVideoStreamEnabled: boolean; 
    }>;
    refs: {
        audioContextRefs: React.MutableRefObject<AudioContextRefs>;
        sessionRefs: React.MutableRefObject<SessionRefs>;
        retryRef: React.MutableRefObject<{ count: number; maxRetries: number; delay: number; timeoutId: number | null; }>;
        isSessionDirty: React.MutableRefObject<boolean>;
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
    clearInactivityTimer: () => void;
}

export const createSessionManager = ({
    propsRef, stateRef, refs, setters, onMessage, finalizeTurn, disableVideoStream, clearInactivityTimer
}: SessionManagerDependencies) => {
    
    const { audioContextRefs, sessionRefs, retryRef, isSessionDirty } = refs;

    // --- All functions are defined within this single scope before being returned.
    // This solves the mutual recursion / temporal dead zone issue.

    const performStop = async (options: { isUnmount?: boolean } = {}) => {
        const { isUnmount = false } = options;
        if (!isUnmount) {
            await playNotificationSound('stop', audioContextRefs.current?.output);
        }
        
        sessionRefs.current?.session?.close();
        if (retryRef.current?.timeoutId) {
            clearTimeout(retryRef.current.timeoutId);
            retryRef.current.timeoutId = null;
        }

        await stopAudioProcessing(audioContextRefs, sessionRefs, { keepMicActive: false });
        
        setters.setIsLive(false);
        setters.setIsMuted(false);
        finalizeTurn();
        disableVideoStream();
    };
    
    const acquireAndSetupMic = async (): Promise<boolean> => {
        const { micStream } = audioContextRefs.current;
        if (micStream && micStream.active) {
            console.log("[Audio Pipe] Reusing existing, active microphone stream.");
            return true;
        }

        try {
            const { input, output } = audioContextRefs.current;
            if (input?.state === 'suspended') await input.resume();
            if (output?.state === 'suspended') await output.resume();
    
            const hasPermissions = await requestMediaPermissions();
            if (!hasPermissions) throw new Error('Permissions were not granted upon request.');
    
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContextRefs.current.micStream = stream;
            if (!audioContextRefs.current.input) throw new Error("Input AudioContext not initialized.");
            audioContextRefs.current.micSourceNode = audioContextRefs.current.input.createMediaStreamSource(stream);
            console.log("[Audio Pipe] Fresh microphone stream acquired and source node created.");
            return true;
        } catch (e) {
            console.error("Failed to acquire microphone stream:", e);
            const errorMessage = e instanceof Error ? e.message : 'An unknown error occurred while accessing the microphone.';
            propsRef.current?.onPermissionError(`Could not access microphone: ${errorMessage}. Please check browser permissions.`);
            await performStop({});
            return false;
        }
    };

    const createLiveSession = ({ aiRef, settings, callbacks }: any) => {
        const ai = aiRef.current;
        if (!ai) return Promise.reject(new Error("AI not initialized."));
        return ai.live.connect({
            model: settings.liveAiModel,
            callbacks,
            config: {
                responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {},
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName || 'Zephyr' } } },
                tools: [{ functionDeclarations: allTools }], 
                systemInstruction: systemInstruction,
            },
        });
    };

    const handleReconnect = (reason: string) => {
        if (retryRef.current && retryRef.current.count < retryRef.current.maxRetries) {
            retryRef.current.count++;
            const delay = retryRef.current.delay * Math.pow(2, retryRef.current.count - 1);
            console.warn(`[AI Live] Session ended: "${reason}". Reconnecting (attempt #${retryRef.current.count}) in ${delay}ms...`);
            
            clearInactivityTimer();
            finalizeTurn();

            if (retryRef.current.timeoutId) clearTimeout(retryRef.current.timeoutId);
            retryRef.current.timeoutId = window.setTimeout(async () => {
                if (retryRef.current) retryRef.current.timeoutId = null;
                
                sessionRefs.current?.session?.close();
                await stopAudioProcessing(audioContextRefs, sessionRefs, { keepMicActive: true });
                
                const micReady = await acquireAndSetupMic();
                if (micReady) {
                    isSessionDirty.current = false;
                    initiateSession();
                }
            }, delay);
        } else {
            const userMessage = `AI voice session failed to reconnect after multiple attempts. Please check your network connection or the service status. The session has been closed.`;
            propsRef.current?.onPermissionError(userMessage);
            performStop({});
        }
    };
    
    const onError = (e: any) => {
        console.error('Live session error:', e);
        const errorMessage = (e as any).message || (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));
        const fatalKeywords = ['permission', 'api key', 'denied', 'quota', 'not found'];
        const isFatal = fatalKeywords.some(kw => errorMessage.toLowerCase().includes(kw));
        
        if (isFatal) {
            const userMessage = `AI voice session failed due to a configuration or permission error: ${errorMessage}. Please check API key validity, ensure the "Generative Language API" is enabled, verify project billing, and check API key restrictions.`;
            propsRef.current?.onPermissionError(userMessage);
            performStop({});
        } else {
            handleReconnect(errorMessage);
        }
    };

    const onclose = (e: CloseEvent) => {
        console.log(`Live session closed. Code: ${e.code}, Reason: ${e.reason}`);
        const fatalKeywords = ['permission', 'api key', 'denied', 'quota', 'not found', 'invalid'];
        const isFatal = fatalKeywords.some(kw => e.reason.toLowerCase().includes(kw));
        if (isFatal) {
            const userMessage = `AI voice session failed: ${e.reason}. Please check your API key, project settings, and ensure you have access to the required models.`;
            propsRef.current?.onPermissionError(userMessage);
            performStop({});
            return;
        }
        if (e.code !== 1000 && stateRef.current.isLive) {
            handleReconnect('Connection closed unexpectedly.');
        }
    };
    
    const initiateSession = () => {
        const { aiRef, settings } = propsRef.current!;
        
        const onOpen = () => {
            setupScriptProcessor(audioContextRefs, sessionRefs);
            const isReconnect = retryRef.current && retryRef.current.count > 0;
            if (isReconnect) {
                console.log("[AI Live] Reconnect successful.");
                playNotificationSound('reconnect', audioContextRefs.current.output);
            }
            if (!stateRef.current?.isMuted) {
                connectMicSourceToProcessor(audioContextRefs);
            }
            if (retryRef.current) retryRef.current.count = 0;
        };

        const sessionPromise = createLiveSession({
            aiRef, settings,
            callbacks: { onopen: onOpen, onmessage: onMessage, onerror: onError, onclose },
        });
        
        sessionPromise.then(session => {
            sessionRefs.current.session = session;
        }).catch(onError);

        sessionRefs.current.sessionPromise = sessionPromise;
    };

    const hotSwapSession = async () => {
        console.log("[AI Live] Hot-swapping session due to config change.");
        await stopAudioProcessing(audioContextRefs, sessionRefs, { keepMicActive: true });
        sessionRefs.current.session?.close();
        isSessionDirty.current = false;
        
        const micReady = await acquireAndSetupMic();
        if (micReady) {
            initiateSession();
        }
    };
    
    const performPause = (duration: number) => {
        console.log(`[AI Live] Pausing listening for ${duration} seconds.`);
        disconnectMicSourceFromProcessor(audioContextRefs);
        setTimeout(() => {
            if (stateRef.current?.isLive && !stateRef.current?.isMuted) {
                console.log("[AI Live] Resuming listening after pause.");
                connectMicSourceToProcessor(audioContextRefs);
            }
        }, duration * 1000);
    };

    const resetRetryState = () => {
        if (retryRef.current) {
            retryRef.current.count = 0;
            if (retryRef.current.timeoutId) {
                clearTimeout(retryRef.current.timeoutId);
                retryRef.current.timeoutId = null;
            }
        }
    };
    
    // --- Return the public API for this manager ---
    return {
        initiateSession,
        performStop,
        performPause,
        resetRetryState,
        hotSwapSession,
        acquireAndSetupMic,
    };
};
