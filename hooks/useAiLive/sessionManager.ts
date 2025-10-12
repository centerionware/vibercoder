// Fix: Add missing import for React to use React-specific types like RefObject.
import React from 'react';
import { Modality, GoogleGenAI } from '@google/genai';
import { AppSettings, ChatThread } from '../../types';
import { allTools, systemInstruction } from '../../services/toolOrchestrator';

// A voice-specific suffix to be appended to the main system instruction.
// This ensures the AI has its full capabilities while adapting its interaction style for voice.
const voiceConversationalSuffix = `

This is a real-time voice conversation.

**CORE PROTOCOL OVERRIDE for VOICE:**
1.  **Conversational Feedback:** Your interaction MUST be conversational.
    -   **Acknowledge First:** When you receive a request, your immediate response MUST be a brief, spoken acknowledgement (e.g., "On it," or "Okay, let me handle that."). You MUST provide any necessary tool calls in the same turn as this acknowledgement.
    -   **Summarize After:** After the tools have been executed and their results provided to you, your next response MUST be a spoken summary of the actions you took (e.g., "All done. I've updated the component file.").
2.  **Visual Context & The "See-and-Respond" Loop:**
    -   Your 'eyes' are a live video stream of the user's screen. This stream is **disabled by default**.
    -   To see the user's screen, you MUST first call the \`enableLiveVideo\` tool.
    -   The \`enableLiveVideo\` tool returns a confirmation and an instruction. Your very next turn MUST be to analyze the now-active video feed and answer the user's original visual question. Do not wait for another prompt from the user. This two-step process (enable video, then analyze) should feel like a single, fluid action to the user.
    -   The video stream automatically disables after 30 seconds. If you need to see again, you must re-enable it.
    -   You MUST NOT call \`captureScreenshot\` in a live session.
3.  **Direct Visual Questions:** For direct visual questions ("what do you see?"), your immediate plan MUST be: \`1. Call enableLiveVideo. 2. Analyze the video feed and answer.\`
4.  **All Other Tasks:** For all other requests, you MUST follow the standard "Mandatory Agent Loop" (Recall memory -> Plan with \`think\` -> Execute). The acknowledgement and summary steps are handled by your spoken responses as described in point 1.

**Tool Error Handling in Voice:** If a tool call like \`interactWithPreview\` fails, your spoken response MUST acknowledge the failure (e.g., "Hmm, that didn't work. Let me look at the code to see why."). Then, you MUST immediately follow the \`Interaction Debugging Workflow\` from your core instructions by calling \`readFile\` to find the correct selectors. Do not attempt the same action again without investigation.

**Response Style:** Your main AI voice responses MUST be extremely concise. Get straight to the point.
`;


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