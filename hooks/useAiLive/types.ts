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
}

// Props needed by the message processor, passed down from the main hook
export interface MessageProcessorProps {
    message: any; // LiveServerMessage
    audioContextRefs: React.MutableRefObject<AudioContextRefs>;
    sessionRefs: React.MutableRefObject<SessionRefs>;
    setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>;
    setIsAiTurn: React.Dispatch<React.SetStateAction<boolean>>;
    requestUiUpdate: () => void;
    cancelUiUpdate: () => void;
    // Props from UseAiLiveProps
    addMessage: (message: AiMessage) => void;
    updateMessage: (id: string, updates: Partial<AiMessage>) => void;
    toolImplementations: Record<string, (args: any) => Promise<any>>;
    settings: AppSettings;
}