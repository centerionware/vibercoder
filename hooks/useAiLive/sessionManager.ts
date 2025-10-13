// Fix: Add missing import for React to use React-specific types like RefObject.
import React from 'react';
import { Modality, GoogleGenAI } from '@google/genai';
import { AppSettings, ChatThread } from '../../types';
import { allTools, systemInstruction } from '../../services/toolOrchestrator';

// A voice-specific suffix to be appended to the main system instruction.
// This ensures the AI has its full capabilities while adapting its interaction style for voice.
const voiceConversationalSuffix = `

This is a real-time voice conversation. Your core protocol MUST be adapted for a spoken interface.

**VOICE-SPECIFIC EXECUTION MODIFICATIONS:**
1.  **Conversational Feedback Loop (MANDATORY):**
    -   As you perform your mandatory 3-step startup protocol (\`viewShortTermMemory\`, \`listPrompts\`, \`think\`), your first spoken words MUST be a brief acknowledgement (e.g., "One moment," or "Okay, let me see what I can do...").
    -   After the startup protocol, inside your \`think\` plan, you MUST decide what to do next.
    -   **Context Hit:** If you proceed with existing protocols, you MUST state this (e.g., "Okay, continuing with our plan...").
    -   **Context Expansion/New Task:** If you load a new protocol, you MUST announce this action (e.g., "Alright, for this I'll use my 'full_stack_development_protocol'.").
    -   **Simple Reply:** If no protocol is needed (like for a greeting), you MUST acknowledge this before replying (e.g., "Okay, no special protocol needed for that. Hello!").
    -   After your plan is complete, your final response MUST be a spoken summary of your action or a direct conversational reply.

2.  **Visual Context (Voice Override):**
    -   To see the user's screen, you MUST use the \`enableLiveVideo\` tool. This replaces the \`captureScreenshot\` tool.

**Response Style:** Your spoken responses MUST be extremely concise. Get straight to the point.
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
        model: settings.liveAiModel,
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