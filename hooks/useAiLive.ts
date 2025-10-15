

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Capacitor } from '@capacitor/core';

import { UseAiLiveProps } from '../types';
import { requestMediaPermissions } from '../utils/permissions';
import { playNotificationSound } from '../utils/audio';

import { useLiveState } from './useAiLive/state';
import { useVideoStream } from './useAiLive/videoManager';
import { createMessageProcessor, useUiUpdater } from './useAiLive/messageProcessor';
import { createSessionManager } from './useAiLive/sessionManager';
import { stopAudioProcessing } from './useAiLive/audioManager';

const INACTIVITY_TIMEOUT = 10000; // 10 seconds

export const useAiLive = (props: UseAiLiveProps) => {
    // --- State and Refs ---
    const { state, setters, refs } = useLiveState();
    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // --- Specialized Hooks and Managers ---
    const { isVideoStreamEnabled, enableVideoStream, disableVideoStream } = useVideoStream(
        props.activeView,
        props.setLiveFrameData,
        refs.sessionRefs.current?.sessionPromise,
        state.isLive
    );
    useEffect(() => { setters.setIsVideoStreamEnabled(isVideoStreamEnabled); }, [isVideoStreamEnabled, setters]);

    const { requestUiUpdate, cancelUiUpdate } = useUiUpdater(propsRef, refs.sessionRefs, refs.uiUpdateTimerRef);
    
    // --- Inactivity Timer ---
    const clearInactivityTimer = useCallback(() => {
        if (refs.inactivityTimerRef.current) {
            clearTimeout(refs.inactivityTimerRef.current);
            refs.inactivityTimerRef.current = null;
        }
    }, [refs.inactivityTimerRef]);

    // This callback is passed to the turn manager to be called on turn completion.
    const startInactivityTimer = useCallback(() => {
        clearInactivityTimer();
        console.log(`[AI Live] Starting ${INACTIVITY_TIMEOUT / 1000}s inactivity reset timer.`);
        refs.inactivityTimerRef.current = window.setTimeout(() => {
            // This ref is set below in an effect to get the latest `initiateSession` function
            inactivityResetCallbackRef.current?.();
        }, INACTIVITY_TIMEOUT);
    }, [clearInactivityTimer, refs.inactivityTimerRef]);

    // --- Create Manager Instances (Memoized) ---
    const messageProcessor = useMemo(() => createMessageProcessor({
        propsRef,
        sessionRefs: refs.sessionRefs,
        ui: {
            requestUiUpdate,
            cancelUiUpdate,
            setIsSpeaking: setters.setIsSpeaking,
            setIsAiTurn: setters.setIsAiTurn,
        },
        audioContextRefs: refs.audioContextRefs,
        inactivity: { clearInactivityTimer, startInactivityTimer },
        stopExecutionRef: refs.stopExecutionRef,
        lastToolChimeTimeRef: refs.lastToolChimeTimeRef,
        isSessionDirty: refs.isSessionDirty,
        endOfTurnTimerRef: refs.endOfTurnTimerRef,
    }), [requestUiUpdate, cancelUiUpdate, setters.setIsSpeaking, setters.setIsAiTurn, refs.sessionRefs, refs.audioContextRefs, clearInactivityTimer, startInactivityTimer, refs.stopExecutionRef, refs.lastToolChimeTimeRef, refs.isSessionDirty, refs.endOfTurnTimerRef]);

    const sessionManager = useMemo(() => createSessionManager({
        propsRef,
        stateRef,
        refs,
        setters,
        onMessage: messageProcessor.onMessage,
        finalizeTurn: messageProcessor.finalizeTurn,
        disableVideoStream,
    }), [propsRef, stateRef, refs, setters, messageProcessor.onMessage, messageProcessor.finalizeTurn, disableVideoStream]);
    
    // --- Public API ---
    const startLiveSession = useCallback(async (): Promise<boolean> => {
        if (stateRef.current.isLive) return false;
        
        sessionManager.resetRetryState();

        const { onPermissionError } = propsRef.current;
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
    }, [sessionManager, refs.audioContextRefs, refs.isSessionDirty, setters]);

    const stopLiveSession = useCallback((options: { immediate?: boolean; isUnmount?: boolean } = {}) => {
        const { immediate = true, isUnmount = false } = options;
        if (isUnmount) {
            sessionManager.performStop({ isUnmount: true });
            return;
        }

        if (immediate) {
            sessionManager.performStop({});
        } else {
            setters.setPendingAction('stop');
        }
    }, [sessionManager, setters]);

    const pauseListening = useCallback((durationInSeconds: number, options: { immediate?: boolean } = {}) => {
        const { immediate = true } = options;
        if (immediate) {
            sessionManager.performPause(durationInSeconds);
        } else {
            setters.setPendingPauseDuration(durationInSeconds);
            setters.setPendingAction('pause');
        }
    }, [sessionManager, setters]);
    
    const toggleMute = useCallback(() => {
        setters.setIsMuted(prev => !prev);
    }, [setters]);

    const inactivityResetCallbackRef = useRef<(() => void) | null>(null);
    useEffect(() => {
        inactivityResetCallbackRef.current = () => {
            if (!stateRef.current.isLive || !refs.isSessionDirty.current) return;
            console.log("[AI Live] Inactivity timer fired. Performing silent session reset.");
            refs.isSessionDirty.current = false;
            sessionManager.hotSwapSession();
        };
    }, [sessionManager, refs.isSessionDirty]);

    // --- Effects for Lifecycle and State Sync ---
    useEffect(() => {
        const canExecuteAction = !state.isAiTurn && !state.isSpeaking && state.pendingAction;
        if (canExecuteAction) {
            if (state.pendingAction === 'stop') {
                sessionManager.performStop({});
            } else if (state.pendingAction === 'pause') {
                sessionManager.performPause(state.pendingPauseDuration);
            }
            setters.setPendingAction(null);
            setters.setPendingPauseDuration(0);
        }
    }, [state.isAiTurn, state.isSpeaking, state.pendingAction, state.pendingPauseDuration, sessionManager, setters]);

    useEffect(() => {
        const input = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const output = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        refs.audioContextRefs.current.input = input;
        refs.audioContextRefs.current.output = output;
        console.log("AudioContexts created.");

        return () => {
            clearInactivityTimer();
            if (stateRef.current.isLive) {
                stopLiveSession({ isUnmount: true, immediate: true });
            }
            input.close().catch(console.error);
            output.close().catch(console.error);
            console.log("AudioContexts closed.");
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    
    useEffect(() => {
        const currentVoice = props.settings.voiceName;
        const previousVoice = refs.sessionRefs.current?.voiceName;
        const shouldRestart = state.isLive && currentVoice !== previousVoice && !state.isSpeaking && !state.isAiTurn && !state.pendingAction;
        if (shouldRestart) {
            if(refs.sessionRefs.current) refs.sessionRefs.current.voiceName = currentVoice;
            sessionManager.hotSwapSession();
        }
        if (!state.isLive && refs.sessionRefs.current) {
            refs.sessionRefs.current.voiceName = currentVoice;
        }
    }, [state.isLive, state.isSpeaking, state.isAiTurn, props.settings.voiceName, sessionManager, state.pendingAction, refs.sessionRefs]);

    // Automatically start live mode if configured
    useEffect(() => {
        if (props.activeView === 'ai' && props.settings.autoEnableLiveMode && !state.isLive) {
            startLiveSession();
        }
    }, [props.activeView, props.settings.autoEnableLiveMode, state.isLive, startLiveSession]);

    return { ...state, startLiveSession, stopLiveSession, toggleMute, pauseListening, enableVideoStream, disableVideoStream, isVideoStreamEnabled };
};
