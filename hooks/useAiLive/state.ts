import { useState, useRef, useMemo } from 'react';
import { AudioContextRefs, SessionRefs } from './types';

export const useLiveState = () => {
    const [isLive, setIsLive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isAiTurn, setIsAiTurn] = useState(false);
    const [pendingAction, setPendingAction] = useState<'stop' | 'pause' | null>(null);
    const [pendingPauseDuration, setPendingPauseDuration] = useState<number>(0);
    const [isVideoStreamEnabled, setIsVideoStreamEnabled] = useState(false);

    const audioContextRefs = useRef<AudioContextRefs>({
        input: null, output: null, micStream: null,
        scriptProcessor: null, micSourceNode: null,
    });
    
    const sessionRefs = useRef<SessionRefs>({
        session: null, sessionPromise: null, audioQueue: new Set(),
        nextStartTime: 0, liveMessageId: null,
        currentInputTranscription: '', currentOutputTranscription: '',
        currentToolCalls: [],
        isAiTurn: false,
        pendingMessageQueue: [],
        isTurnFinalizing: false,
        voiceName: '',
    });
    
    const retryRef = useRef({
        count: 0,
        maxRetries: 3,
        delay: 1000,
        timeoutId: null as number | null,
    });
    
    const isSessionDirty = useRef(false);
    const stopExecutionRef = useRef(false);
    const uiUpdateTimerRef = useRef<number | null>(null);
    const endOfTurnTimerRef = useRef<number | null>(null);
    const inactivityTimerRef = useRef<number | null>(null);
    const lastToolChimeTimeRef = useRef(0);

    const state = { isLive, isMuted, isSpeaking, isAiTurn, isVideoStreamEnabled, pendingAction, pendingPauseDuration };
    
    // By memoizing the setters object, we ensure its reference is stable across re-renders.
    // This is crucial for hooks that depend on it, preventing unnecessary re-calculations.
    const setters = useMemo(() => ({
        setIsLive,
        setIsMuted,
        setIsSpeaking,
        setIsAiTurn,
        setPendingAction,
        setPendingPauseDuration,
        setIsVideoStreamEnabled
    }), []); // State setters from useState are stable and don't need to be listed as dependencies.


    const refs = {
        audioContextRefs, sessionRefs, retryRef, isSessionDirty, stopExecutionRef,
        uiUpdateTimerRef, endOfTurnTimerRef, inactivityTimerRef, lastToolChimeTimeRef
    };

    return { state, setters, refs };
};
