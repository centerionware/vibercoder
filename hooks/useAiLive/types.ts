import React from 'react';
import { AiMessage, AppSettings, ToolCall } from '../../types';

// The LiveSession is not an exported type from the SDK, so we define it locally.
export interface LiveSession {
  close: () => void;
  sendRealtimeInput: (params: { media: any }) => void;
  sendToolResponse: (params: any) => void;
}

export interface AudioContextRefs {
    input: AudioContext | null;
    output: AudioContext | null;
    micStream: MediaStream | null;
    scriptProcessor: ScriptProcessorNode | null;
    micSourceNode: MediaStreamAudioSourceNode | null;
}

export interface SessionRefs {
    session: LiveSession | null;
    sessionPromise: Promise<LiveSession> | null;
    audioQueue: Set<AudioBufferSourceNode>;
    nextStartTime: number;
    liveMessageId: string | null;
    currentInputTranscription: string;
    currentOutputTranscription: string;
    currentToolCalls: ToolCall[];
    isAiTurn: boolean;
    // New properties for end-of-turn debouncing
    pendingMessageQueue: any[];
    isTurnFinalizing: boolean;
}