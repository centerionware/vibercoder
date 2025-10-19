
import React from 'react';
import { Modality } from '@google/genai';
import { UseAiLiveProps } from '../../types';
import { allTools, systemInstruction } from '../../services/toolOrchestrator';
import { stopAudioProcessing, setupScriptProcessor, connectMicSourceToProcessor, disconnectMicSourceFromProcessor } from './audioManager';
import { playNotificationSound } from '../../utils/audio';
import { AudioContextRefs, SessionRefs } from './types';
import { requestMediaPermissions } from '../../utils/permissions';

const liveTools = allTools.filter(t => 
    t.name !== 'captureScreenshot' && 
    t.name !== 'enableScreenshotPreview' &&
    t.name !== 'getChatHistory'
);

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

    const self = {} as {
        initiateSession: () => void;
        performStop: (options?: { isUnmount?: boolean }) => Promise<void>;
        onError: (e: any) => void;
    };

    const acquireAndSetupMic = async (): Promise<boolean> => {
        try {
            // It's crucial to ensure the AudioContexts are running before acquiring the mic.
            // This is safe to call even if they are already running, and necessary for recovery.
            const { input, output } = audioContextRefs.current;
            if (input?.state === 'suspended') {
                await input.resume();
            }
            if (output?.state === 'suspended') {
                await output.resume();
            }
    
            const hasPermissions = await requestMediaPermissions();
            if (!hasPermissions) {
                throw new Error('Permissions were not granted upon request.');
            }
    
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
            // This is a fatal error for the session, so perform a full stop.
            await self.performStop({});
            return false;
        }
    };


    self.onError = (e: any) => {
        console.error('Live session error:', e);

        // Per user request, removed the check for 'isTrusted: false' as it was preventing
        // proper recovery for some errors. All errors will now be evaluated for retry.

        const errorMessage = (e as any).message || (typeof e === 'object' && e !== null ? JSON.stringify(e) : String(e));

        // Broaden the retry logic. We will attempt to retry any error that doesn't
        // appear to be a fatal configuration or permission issue.
        const fatalKeywords = ['permission', 'api key', 'denied', 'quota', 'not found'];
        const isFatal = fatalKeywords.some(kw => errorMessage.toLowerCase().includes(kw));
        const isRetryable = !isFatal;

        if (isRetryable && retryRef.current && retryRef.current.count < retryRef.current.maxRetries) {
            retryRef.current.count++;
            const delay = retryRef.current.delay * Math.pow(2, retryRef.current.count - 1);
            console.warn(`[AI Live] Retryable error occurred: "${errorMessage}". Reconnecting (attempt #${retryRef.current.count}) in ${delay}ms...`);
            
            clearInactivityTimer();
            finalizeTurn();

            if (retryRef.current.timeoutId) clearTimeout(retryRef.current.timeoutId);
            retryRef.current.timeoutId = window.setTimeout(async () => {
                if (retryRef.current) retryRef.current.timeoutId = null;
                
                // --- Robust Recovery Sequence ---
                // 1. Close the old session object.
                sessionRefs.current?.session?.close();
                
                // 2. Perform a FULL teardown of the audio pipeline, including releasing the old microphone stream.
                await stopAudioProcessing(audioContextRefs, sessionRefs, { keepMicActive: false });
                
                // 3. Acquire a FRESH microphone stream and create a new source node.
                //    This prevents state corruption from the old stream. It does NOT re-prompt for permission.
                const micReady = await acquireAndSetupMic();

                // 4. Only if the mic is successfully acquired, start a new session.
                if (micReady) {
                    isSessionDirty.current = false;
                    self.initiateSession();
                }
            }, delay);
        } else {
            let userMessage = `A critical error occurred with the voice session: ${errorMessage}. Session closed.`;
            if (isFatal) {
                userMessage = `AI voice session failed due to a configuration or permission error: ${errorMessage}. Please check API key validity, ensure the "Generative Language API" is enabled, verify project billing, and check API key restrictions.`;
            } else if (retryRef.current && retryRef.current.count >= retryRef.current.maxRetries) {
                userMessage = `AI voice session failed to reconnect after multiple attempts. Please check your network connection or the service status. The session has been closed.`;
            }
            propsRef.current?.onPermissionError(userMessage);
            self.performStop({});
        }
    };
    
    const createLiveSession = ({ aiRef, settings, activeThread, callbacks }: any) => {
        const ai = aiRef.current;
        if (!ai) return Promise.reject(new Error("AI not initialized."));
        return ai.live.connect({
            model: settings.liveAiModel,
            callbacks,
            config: {
                responseModalities: [Modality.AUDIO], inputAudioTranscription: {}, outputAudioTranscription: {},
                speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName || 'Zephyr' } } },
                tools: [{ functionDeclarations: liveTools }], systemInstruction: systemInstruction,
            },
        });
    };

    self.initiateSession = () => {
        const { aiRef, settings, activeThread } = propsRef.current!;
        const onOpen = () => {
            setupScriptProcessor(audioContextRefs, sessionRefs);

            const isReconnect = retryRef.current && retryRef.current.count > 0;
            if (isReconnect) {
                console.log("[AI Live] Reconnect successful.");
                playNotificationSound('reconnect', audioContextRefs.current.output);
            }
            
            console.log("[Audio Pipe] Ensuring microphone is connected post-session-open.");
            if (!stateRef.current?.isMuted) {
                connectMicSourceToProcessor(audioContextRefs);
            }
            
            if (retryRef.current) retryRef.current.count = 0;
        };

        const onclose = () => {
            console.log('Live session closed.');
        };

        const sessionPromise = createLiveSession({
            aiRef, settings, activeThread,
            callbacks: { onopen: onOpen, onmessage: onMessage, onerror: self.onError, onclose },
        });
        
        sessionPromise.then(session => {
            sessionRefs.current.session = session;
        }).catch(self.onError);

        sessionRefs.current.sessionPromise = sessionPromise;
    };

    const hotSwapSession = async () => {
        console.log("[AI Live] Hot-swapping session due to config change.");
        // Perform a full teardown and re-acquisition to ensure a clean state
        await stopAudioProcessing(audioContextRefs, sessionRefs, { keepMicActive: false });
        sessionRefs.current.session?.close();
        isSessionDirty.current = false;
        
        const micReady = await acquireAndSetupMic();
        if (micReady) {
            self.initiateSession();
        }
    };

    self.performStop = async (options = {}) => {
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


    return {
        initiateSession: self.initiateSession,
        performStop: self.performStop,
        performPause,
        resetRetryState,
        hotSwapSession,
        acquireAndSetupMic,
    };
};
