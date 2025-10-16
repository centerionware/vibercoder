
import React, { useCallback } from 'react';
import { Capacitor } from '@capacitor/core';
import { UseAiLiveProps } from '../../types';
import { requestMediaPermissions } from '../../utils/permissions';
import { playNotificationSound } from '../../utils/audio';
import { connectMicSourceToProcessor, disconnectMicSourceFromProcessor } from './audioManager';
import { interruptPlayback } from './playbackQueue';
import { SessionRefs, AudioContextRefs } from './types';
import { createSessionManager } from './sessionManager';
import { createMessageProcessor } from './messageProcessor';

interface PublicApiProps {
    sessionManager: ReturnType<typeof createSessionManager>;
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

/**
 * A hook that creates the public API functions for controlling the live AI session.
 * @param deps The dependencies required to create the API functions.
 * @returns An object containing all the public control functions.
 */
export const usePublicApi = (deps: PublicApiProps) => {
    const { sessionManager, messageProcessor, refs, setters, stateRef, propsRef } = deps;

    const startLiveSession = useCallback(async (): Promise<boolean> => {
        if (stateRef.current.isLive) return false;
        
        sessionManager.resetRetryState();

        const { onPermissionError } = propsRef.current!;
        const { input, output } = refs.audioContextRefs.current;
        
        if (input?.state === 'suspended') await input.resume();
        if (output?.state === 'suspended') await output.resume();

        try {
            const hasPermissions = await requestMediaPermissions();
            if (!hasPermissions) {
                throw new Error('Required permissions were not granted by the user.');
            }

            refs.audioContextRefs.current.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!refs.audioContextRefs.current.input) throw new Error("Input AudioContext not initialized.");
            refs.audioContextRefs.current.micSourceNode = refs.audioContextRefs.current.input.createMediaStreamSource(refs.audioContextRefs.current.micStream);
        } catch (e) {
            console.error("Permission denied for live session:", e);
            const message = Capacitor.isNativePlatform()
                ? "Microphone and Camera access are required for live sessions. Please go to your device's app settings to enable these permissions for VibeCode."
                : "Microphone and Camera permissions were denied. Please enable them in your browser's site settings and reload the page.";
            onPermissionError(message);
            return false;
        }
        
        refs.isSessionDirty.current = false;

        await playNotificationSound('start', refs.audioContextRefs.current.output);
        setters.setIsLive(true);
        sessionManager.initiateSession();
        return true;
    }, [sessionManager, refs.audioContextRefs, refs.isSessionDirty, setters, propsRef, stateRef]);

    const stopLiveSession = useCallback((options: { immediate?: boolean; isUnmount?: boolean } = {}) => {
        const { immediate = true, isUnmount = false } = options;
        if (isUnmount) {
            sessionManager.performStop({ isUnmount: true });
            return;
        }

        if (immediate) {
            sessionManager.performStop({});
        } else {
            // This setter is part of the `useLiveState` hook, passed through `useAiLive` orchestrator.
            // It allows deferring the stop action until the AI is no longer speaking.
            (setters as any).setPendingAction('stop');
        }
    }, [sessionManager, setters]);
    
    const interrupt = useCallback(() => {
        console.log("[AI Live] Interrupt signal received.");
        interruptPlayback(refs.sessionRefs);
        setters.setIsSpeaking(false);
        refs.stopExecutionRef.current = true; // Signal to tool executor to stop
        
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
        setters.setIsMuted(prev => !prev);
    }, [setters]);

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
