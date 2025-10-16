
import React, { useEffect } from 'react';
import { UseAiLiveProps } from '../../types';
import { createSessionManager } from './sessionManager';
import { SessionRefs, AudioContextRefs } from './types';

interface SessionLifecycleProps {
    state: {
        isLive: boolean;
        isSpeaking: boolean;
        isAiTurn: boolean;
        pendingAction: 'stop' | 'pause' | null;
        pendingPauseDuration: number;
    };
    setters: {
        setPendingAction: React.Dispatch<React.SetStateAction<'stop' | 'pause' | null>>;
        setPendingPauseDuration: React.Dispatch<React.SetStateAction<number>>;
    };
    sessionManager: ReturnType<typeof createSessionManager>;
    propsRef: React.RefObject<UseAiLiveProps>;
    refs: {
        audioContextRefs: React.MutableRefObject<AudioContextRefs>;
        sessionRefs: React.MutableRefObject<SessionRefs>;
    };
    startLiveSession: () => Promise<boolean>;
    stopLiveSession: (options?: { immediate?: boolean; isUnmount?: boolean }) => void;
}

/**
 * A hook to manage the side effects and lifecycle of the live AI session.
 * @param deps The dependencies required to manage the lifecycle.
 */
export const useSessionLifecycle = (deps: SessionLifecycleProps) => {
    const { state, setters, sessionManager, propsRef, refs, startLiveSession, stopLiveSession } = deps;

    // Effect to handle deferred actions (stop/pause) when the AI is no longer speaking.
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

    // Effect to initialize and clean up the global AudioContexts for the app.
    useEffect(() => {
        const input = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const output = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        refs.audioContextRefs.current.input = input;
        refs.audioContextRefs.current.output = output;
        console.log("AudioContexts created.");

        // Return a cleanup function that runs on unmount.
        return () => {
            if (state.isLive) {
                stopLiveSession({ isUnmount: true, immediate: true });
            }
            input.close().catch(console.error);
            output.close().catch(console.error);
            console.log("AudioContexts closed.");
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []); // This effect should run only once on mount.

    // Effect to hot-swap the session if the selected AI voice changes.
    useEffect(() => {
        const currentVoice = propsRef.current?.settings.voiceName;
        const previousVoice = refs.sessionRefs.current?.voiceName;
        const shouldRestart = state.isLive && currentVoice !== previousVoice && !state.isSpeaking && !state.isAiTurn && !state.pendingAction;

        if (shouldRestart) {
            if (refs.sessionRefs.current) refs.sessionRefs.current.voiceName = currentVoice!;
            sessionManager.hotSwapSession();
        }
        if (!state.isLive && refs.sessionRefs.current) {
            refs.sessionRefs.current.voiceName = currentVoice!;
        }
    }, [state.isLive, state.isSpeaking, state.isAiTurn, propsRef.current?.settings.voiceName, sessionManager, state.pendingAction, refs.sessionRefs]);

    // Effect to automatically start the live session if configured to do so.
    useEffect(() => {
        const { activeView, settings } = propsRef.current!;
        if (activeView === 'ai' && settings.autoEnableLiveMode && !state.isLive) {
            startLiveSession();
        }
    }, [propsRef.current?.activeView, propsRef.current?.settings.autoEnableLiveMode, state.isLive, startLiveSession]);
};
