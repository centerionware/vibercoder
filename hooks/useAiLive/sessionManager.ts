import { Modality, GoogleGenAI } from '@google/genai';
import { AppSettings, ChatThread } from '../../types';
import { allTools, systemInstruction } from '../../services/toolOrchestrator';

// A voice-specific suffix to be appended to the main system instruction.
// This ensures the AI has its full capabilities while adapting its interaction style for voice.
const voiceConversationalSuffix = `

This is a real-time voice conversation.

**CORE PROTOCOL OVERRIDE for VOICE:**
1.  **Visual Context:** You are receiving a continuous 1 FPS video stream of the user's screen. This is your 'eyes'. Therefore, you MUST NOT call the \`captureScreenshot\` tool.
2.  **Direct Visual Questions:** The standard protocol is to check memory first. However, in this live voice session, if the user asks a direct visual question (e.g., "what do you see?"), you MUST override the protocol. Your first and only action should be to answer that question based on the live video stream. Do not call any tools.
3.  **All Other Tasks:** For all other requests, you MUST follow the standard "Mandatory Agent Loop" (Recall memory -> Plan -> Execute -> Memorize & Reflect).

**Response Style:** Your spoken responses MUST be extremely concise. Get straight to the point. While you are working on a multi-step task, you should provide brief, single-sentence spoken updates after a tool has successfully executed (e.g., "File read.", "Okay, I've updated the component."). Do not describe what you are about to do; only confirm what you have just done. Your primary focus is always on completing the task using your tools.`;


// The full instruction for the live session combines the core directive with voice-specific nuances.
const liveSystemInstruction = systemInstruction + voiceConversationalSuffix;

// For live sessions, we remove the screenshot tool as it's replaced by the continuous video stream.
const liveTools = allTools.filter(t => t.name !== 'captureScreenshot' && t.name !== 'enableScreenshotPreview');

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

    return ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-09-2025',
        callbacks,
        config: {
            responseModalities: [Modality.AUDIO],
            inputAudioTranscription: {},
            outputAudioTranscription: {},
            speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: settings.voiceName || 'Zephyr' } },
            },
            tools: [{ functionDeclarations: liveTools }],
            systemInstruction: liveSystemInstruction,
        },
    });
};