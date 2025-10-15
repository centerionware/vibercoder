import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { UseAiLiveProps } from '../../types';
import { SessionRefs } from './types';
import { playNotificationSound } from '../../utils/audio';

type TurnManagerDependencies = {
    propsRef: React.RefObject<UseAiLiveProps>;
    sessionRefs: React.RefObject<SessionRefs>;
    ui: {
        cancelUiUpdate: () => void;
        setIsAiTurn: (isAiTurn: boolean) => void;
    };
    audioContext: AudioContext | null;
    inactivity: {
        startInactivityTimer: () => void;
        clearInactivityTimer: () => void;
    }
};

export const startTurnIfNeeded = (
    propsRef: React.RefObject<UseAiLiveProps>,
    sessionRefs: React.RefObject<SessionRefs>,
    stopExecutionRef: React.RefObject<boolean>
) => {
    if (!sessionRefs.current?.liveMessageId) {
        propsRef.current?.onStartAiRequest();
        const liveMessageId = uuidv4();
        sessionRefs.current!.liveMessageId = liveMessageId;
        propsRef.current?.addMessage({ id: liveMessageId, role: 'user', content: '', isLive: true });
        propsRef.current?.addMessage({ id: `${liveMessageId}-model`, role: 'model', content: '', isLive: true });
        stopExecutionRef.current = false;
    }
};

export const createTurnManager = (deps: TurnManagerDependencies) => {
    const finalizeTurn = (processPendingMessages: (msg: any) => void) => {
        if (!deps.sessionRefs.current) return;
        
        console.log("[AI Live] Finalizing turn, processing message queue.");
        playNotificationSound('ai-stop', deps.audioContext);
        deps.sessionRefs.current.isTurnFinalizing = false;

        const queue = [...deps.sessionRefs.current.pendingMessageQueue];
        deps.sessionRefs.current.pendingMessageQueue = [];

        queue.forEach(msg => processPendingMessages(msg));
        
        if (deps.sessionRefs.current.isAiTurn) {
            deps.sessionRefs.current.isAiTurn = false;
            deps.ui.setIsAiTurn(false);
        }
        
        deps.ui.cancelUiUpdate();
        const { liveMessageId, currentInputTranscription, currentOutputTranscription, currentToolCalls } = deps.sessionRefs.current;
        if (liveMessageId) {
            deps.propsRef.current?.updateMessage(liveMessageId, { content: currentInputTranscription, isLive: false });
            deps.propsRef.current?.updateMessage(`${liveMessageId}-model`, { 
                content: currentOutputTranscription, 
                isLive: false,
                toolCalls: [...currentToolCalls]
            });
            deps.propsRef.current?.onEndAiRequest();
        }

        deps.sessionRefs.current.liveMessageId = null;
        deps.sessionRefs.current.currentInputTranscription = '';
        deps.sessionRefs.current.currentOutputTranscription = '';
        deps.sessionRefs.current.currentToolCalls = [];

        deps.inactivity.startInactivityTimer();
    };

    return { finalizeTurn };
};
