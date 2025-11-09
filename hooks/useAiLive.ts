// =================================================================================================
// ARCHITECTURAL NOTE: This file is an ORCHESTRATOR for the AI Live Session.
//
// Its purpose is to compose smaller, specialized hooks from the `hooks/useAiLive/` directory.
// It should not contain complex logic for specific features like video streaming,
// inactivity timers, or message processing.
//
// When adding a new feature to the live session, DO NOT add the logic directly here.
// Instead, follow this pattern:
// 1. Create a new, dedicated hook within the `hooks/useAiLive/` directory (e.g., `useTranscriptionManager.ts`).
// 2. Encapsulate all state and logic for the new feature within that file.
// 3. Import and call the new hook from within this `useAiLive` orchestrator.
// 4. Integrate its state and functions into the overall live session management.
//
// This keeps the live session logic modular, testable, and prevents this file from becoming unstable.
// =================================================================================================

import { useEffect, useMemo, useRef } from 'react';
import { UseAiLiveProps } from '../types';
import { useLiveState } from './useAiLive/state';
import { useVideoStream } from './useAiLive/videoManager';
import { createMessageProcessor, useUiUpdater } from './useAiLive/messageProcessor';
import { createSessionManager } from './useAiLive/sessionManager';
import { useInactivityTimer } from './useAiLive/useInactivityTimer';
import { usePublicApi } from './useAiLive/usePublicApi';
import { useSessionLifecycle } from './useAiLive/useSessionLifecycle';

export const useAiLive = (props: UseAiLiveProps) => {
    // 1. Centralized state and refs from a dedicated state hook
    const { state, setters, refs } = useLiveState();
    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    // 2. Specialized hooks for discrete UI features
    const { isVideoStreamEnabled, enableVideoStream, disableVideoStream } = useVideoStream(
        props.activeView,
        props.setLiveFrameData,
        refs.sessionRefs.current?.sessionPromise,
        state.isLive
    );
    useEffect(() => { setters.setIsVideoStreamEnabled(isVideoStreamEnabled); }, [isVideoStreamEnabled, setters]);
    const { requestUiUpdate, cancelUiUpdate } = useUiUpdater(propsRef, refs.sessionRefs, refs.uiUpdateTimerRef);

    // 3. Inactivity Management Hook - needs a callback that uses sessionManager
    const inactivityResetCallbackRef = useRef<(() => void) | null>(null);
    const { startTimer: startInactivityTimer, clearTimer: clearInactivityTimer } = useInactivityTimer(() => {
        inactivityResetCallbackRef.current?.();
    });

    // 4. Memoized Core Logic Managers (the "brains" of the operation)
    // These are created here and passed as dependencies to the new hooks.
    const messageProcessor = useMemo(() => createMessageProcessor({
        propsRef,
        sessionRefs: refs.sessionRefs,
        ui: { requestUiUpdate, cancelUiUpdate, setIsSpeaking: setters.setIsSpeaking, setIsAiTurn: setters.setIsAiTurn },
        audioContextRefs: refs.audioContextRefs,
        inactivity: { clearInactivityTimer, startInactivityTimer },
        stopExecutionRef: refs.stopExecutionRef,
        lastToolChimeTimeRef: refs.lastToolChimeTimeRef,
        isSessionDirty: refs.isSessionDirty,
        endOfTurnTimerRef: refs.endOfTurnTimerRef,
    }), [requestUiUpdate, cancelUiUpdate, setters.setIsSpeaking, setters.setIsAiTurn, refs, clearInactivityTimer, startInactivityTimer, propsRef]);

    const sessionManager = useMemo(() => createSessionManager({
        propsRef,
        stateRef,
        refs,
        setters,
        onMessage: messageProcessor.onMessage,
        finalizeTurn: messageProcessor.finalizeTurn,
        disableVideoStream,
        // FIX: Pass the clearInactivityTimer function to the session manager. This allows the error handler to prevent a race condition where the inactivity timer and the error recovery logic would both try to reconnect the session.
        clearInactivityTimer,
    }), [propsRef, stateRef, refs, setters, messageProcessor.onMessage, messageProcessor.finalizeTurn, disableVideoStream, clearInactivityTimer]);
    
    // Define the callback for the inactivity timer, now that sessionManager exists.
    inactivityResetCallbackRef.current = () => {
        if (stateRef.current.isLive && refs.isSessionDirty.current) {
            console.log("[AI Live] Inactivity timer fired. Performing silent session reset.");
            refs.isSessionDirty.current = false;
            
            // 1. Finalize the client-side turn state. This cleans up the UI and in-flight message state.
            messageProcessor.finalizeTurn();
            
            // 2. Create a new server-side session. This clears the server's context.
            // The client-side shortTermMemory is intentionally preserved. The AI will rediscover it
            // via tools in the new session, forcing it to re-evaluate its context.
            sessionManager.hotSwapSession();
        }
    };

    // 5. Public API Hook - Creates the functions that will be returned to the app
    const publicApi = usePublicApi({
        sessionManager,
        messageProcessor,
        refs,
        setters,
        stateRef,
        propsRef,
    });

    // 6. Lifecycle Hook - Manages all useEffects for the session
    useSessionLifecycle({
        state,
        setters,
        sessionManager,
        propsRef,
        refs,
        startLiveSession: publicApi.startLiveSession,
        stopLiveSession: publicApi.stopLiveSession,
    });

    // 7. Combine state and APIs and return to the main App
    return {
        ...state,
        ...publicApi,
        isVideoStreamEnabled,
        enableVideoStream,
        disableVideoStream,
    };
};