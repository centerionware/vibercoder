import React from 'react';
import { v4 as uuidv4 } from 'uuid';
import { UseAiLiveProps } from '../../types';
import { SessionRefs } from './types';

/**
 * Ensures user and model messages exist in the chat for the current live turn.
 * If they don't exist, it creates them. This is called when the first transcription
 * or tool call for a turn is received.
 * @param propsRef A ref to the component's props.
 * @param sessionRefs A mutable ref to the current session's state.
 * @param stopExecutionRef A mutable ref to the flag for stopping tool execution.
 */
export const startTurnIfNeeded = (
    propsRef: React.RefObject<UseAiLiveProps>,
    sessionRefs: React.MutableRefObject<SessionRefs>,
    stopExecutionRef: React.MutableRefObject<boolean>
) => {
    if (!sessionRefs.current?.liveMessageId) {
        propsRef.current?.onStartAiRequest();
        const liveMessageId = uuidv4();
        sessionRefs.current.liveMessageId = liveMessageId;
        propsRef.current?.addMessage({ id: liveMessageId, role: 'user', content: '', isLive: true });
        propsRef.current?.addMessage({ id: `${liveMessageId}-model`, role: 'model', content: '', isLive: true });
        stopExecutionRef.current = false;
    }
};
