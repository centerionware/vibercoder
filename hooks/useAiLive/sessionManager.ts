import { Modality, GoogleGenAI } from '@google/genai';
import { AppSettings, ChatThread } from '../../types';
import { allTools, systemInstruction } from '../../services/toolOrchestrator';

// A voice-specific suffix to be appended to the main system instruction.
// This ensures the AI has its full capabilities while adapting its interaction style for voice.
const voiceConversationalSuffix = `

Additionally, since this is a real-time voice conversation, keep your spoken responses natural and concise. Announce what you are about to do before executing a tool call (e.g., "Okay, reading the file," or "Generating the image now..."). Prioritize completing the user's request efficiently over prolonged conversation.`;

// The full instruction for the live session combines the core directive with voice-specific nuances.
const liveSystemInstruction = systemInstruction + voiceConversationalSuffix;


interface CreateLiveSessionProps {
    aiRef: React.RefObject<GoogleGenAI | null>;
    settings: AppSettings;
    activeThread: ChatThread | undefined;
    callbacks: {
        onopen: () => void;
        onmessage: (message: any) => void;
        onerror: (e: ErrorEvent) => void;
        onclose: (e: CloseEvent) => void;
    };
}

export const createLiveSession = ({ aiRef, settings, activeThread, callbacks }: CreateLiveSessionProps) => {
    const ai = aiRef.current;
    if (!ai) {
        return Promise.reject(new Error("AI not initialized."));
    }

    // --- Context Truncation Logic ---
    // To manage token usage and provide relevant context, we'll send the last few
    // turns from the chat history. A "turn" consists of a user message and a model response.
    const MAX_HISTORY_TURNS = 3; // 3 turns = 6 history items (user, model, user, model...)
    const history = activeThread?.history || [];
    const truncatedHistory = history.slice(-MAX_HISTORY_TURNS * 2);


    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        // FIX: The `context` property, which contains chat history, is a top-level property for a `live.connect` call, not part of the `config` object.
        context: {
            history: truncatedHistory,
        },
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName || 'Zephyr' } },
            },
            tools: [{ functionDeclarations: allTools }],
            systemInstruction: liveSystemInstruction,
        },
    });
};
