import React, { useCallback } from 'react';
import { UseAiLiveProps } from '../../types';
import { playNotificationSound } from '../../utils/audio';
import { connectMicSourceToProcessor, disconnectMicSourceFromProcessor } from './audioManager';
import { interruptPlayback } from './playbackQueue';
import { SessionRefs, AudioContextRefs } from './types';
import { createSessionManager } from './sessionManager';
import { createMessageProcessor } from './messageProcessor';

interface PublicApiProps {
    sessionManager: ReturnType<typeof createSessionManager> & { acquireAndSetupMic: () => Promise<boolean> };
    messageProcessor: ReturnType<typeof createMessageProcessor>;
    refs: {
        audioContextRefs: React.MutableRefObject<AudioContextRefs>;
        sessionRefs: React.MutableRefObject<SessionRefs>;
        isSessionDirty: React.MutableRefObject<boolean>;
        stopExecutionRef: React.MutableRefObject<boolean>;
        endOfTurnTimerRef: React.MutableRefObject<number | null>;
    };
    setters: {
        setIsLive: React.Dispatch<React.SetStateAction<boolean>>;
        setIsMuted: React.Dispatch<React.SetStateAction<boolean>>;
        setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
    };
    stateRef: React.RefObject<{ isLive: boolean; }>;
    propsRef: React.RefObject<UseAiLiveProps>;
}

export const usePublicApi = (deps: PublicApiProps) => {
    const { sessionManager, messageProcessor, refs, setters, stateRef, propsRef } = deps;

    const startLiveSession = useCallback(async (): Promise<boolean> => {
        if (stateRef.current.isLive) return false;

        if (!propsRef.current?.settings.apiKey) {
            propsRef.current?.onPermissionError("API key is missing. Please open Settings and add your Google Gemini API key to use voice chat.");
            return false;
        }
        
        // Explicitly resume contexts here, inside the user gesture handler. This is the most
        // reliable way to ensure the audio pipeline is not in a suspended state.
        const { input, output } = refs.audioContextRefs.current;
        if (input?.state === 'suspended') {
            await input.resume();
        }
        if (output?.state === 'suspended') {
            await output.resume();
        }
        
        sessionManager.resetRetryState();
        const micReady = await sessionManager.acquireAndSetupMic();
        if (!micReady) {
            return false;
        }
        
        refs.isSessionDirty.current = false;

        await playNotificationSound('start', refs.audioContextRefs.current.output);
        setters.setIsLive(true);
        sessionManager.initiateSession();
        return true;
    }, [sessionManager, refs.audioContextRefs, refs.isSessionDirty, setters, stateRef, propsRef]);

    const stopLiveSession = useCallback((options: { immediate?: boolean; isUnmount?: boolean } = {}) => {
        const { immediate = true, isUnmount = false } = options;
        if (isUnmount) {
            sessionManager.performStop({ isUnmount: true });
            return;
        }

        if (immediate) {
            sessionManager.performStop({});
        } else {
            (setters as any).setPendingAction('stop');
        }
    }, [sessionManager, setters]);
    
    const interrupt = useCallback(() => {
        console.log("[AI Live] Interrupt signal received.");
        interruptPlayback(refs.sessionRefs);
        setters.setIsSpeaking(false);
        refs.stopExecutionRef.current = true;
        
        if (refs.endOfTurnTimerRef.current) {
            clearTimeout(refs.endOfTurnTimerRef.current);
            refs.endOfTurnTimerRef.current = null;
        }
        
        messageProcessor.finalizeTurn();
    }, [refs.sessionRefs, refs.stopExecutionRef, refs.endOfTurnTimerRef, setters, messageProcessor]);

    const pauseListening = useCallback((durationInSeconds: number, options: { immediate?: boolean } = {}) => {
        const { immediate = true } = options;
        if (immediate) {
            sessionManager.performPause(durationInSeconds);
        } else {
            (setters as any).setPendingPauseDuration(durationInSeconds);
            (setters as any).setPendingAction('pause');
        }
    }, [sessionManager, setters]);
    
    const toggleMute = useCallback(() => {
        setters.setIsMuted(prev => {
            const newMutedState = !prev;
            if (newMutedState) {
                disconnectMicSourceFromProcessor(refs.audioContextRefs);
            } else {
                connectMicSourceToProcessor(refs.audioContextRefs);
            }
            return newMutedState;
        });
    }, [setters, refs.audioContextRefs]);

    const setAudioPipe = useCallback((target: 'ai' | 'none') => {
        if (target === 'ai') {
            connectMicSourceToProcessor(refs.audioContextRefs);
        } else {
            disconnectMicSourceFromProcessor(refs.audioContextRefs);
        }
    }, [refs.audioContextRefs]);

    return {
        startLiveSession,
        stopLiveSession,
        interrupt,
        pauseListening,
        toggleMute,
        setAudioPipe
    };
};
