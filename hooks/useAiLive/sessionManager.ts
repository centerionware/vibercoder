// Fix: Add missing import for React to use React-specific types like RefObject.
import React from 'react';
import { Modality, GoogleGenAI } from '@google/genai';
import { AppSettings, ChatThread } from '../../types';
import { allTools } from '../../services/toolOrchestrator';

// A dedicated system instruction for the live, stateful voice conversation.
const liveSystemInstruction = `You are Vibe, an expert AI agent, engaged in a real-time, stateful voice conversation. Your memory of this conversation is automatically maintained by the session.

**MANDATORY, UNCONDITIONAL STARTUP PROTOCOL:**
For EVERY user request, your FIRST THREE actions MUST BE, in this exact order, without exception:
1.  **Action 1:** \`viewShortTermMemory()\` to check for active protocols.
2.  **Action 2:** \`listPrompts()\` to see all available skills.
3.  **Action 3:** \`think()\` to formulate a plan based on the user's request, your memory, and available skills.

**CONTEXT LOGIC (to be used inside your \`think\` plan):**
-   **Analyze:** You have intrinsic memory of this conversation. Your analysis should focus on what skills (protocols) are needed for the user's request.
-   **Case 1: Continue Task.** If your 'active_protocols' are sufficient, proceed with the task.
-   **Case 2: New Task or Expand Context.** If 'active_protocols' is empty OR you need a new skill:
    1. Identify the relevant protocol(s) from the list.
    2. If any are relevant, your plan's next steps MUST be:
        a. Call \`readPrompts()\` to load them.
        b. Call \`updateShortTermMemory()\` to save/add them to 'active_protocols'.
-   **Case 3: No Relevant Protocol.** If the request is simple (like a greeting), just respond conversationally after your mandatory startup actions.

**VOICE-SPECIFIC MODIFICATIONS:**
-   **Conversational Feedback:** As you execute your startup protocol, provide brief spoken acknowledgements ("Okay," "Let me check..."). When you choose a protocol, announce it ("Alright, I'll use my development protocol for this.").
-   **Visual Context:** To see the user's screen, you MUST use the \`enableLiveVideo\` tool.
-   **Response Style:** Be concise and to the point.`;


// For live sessions, we remove tools that are redundant due to the stateful nature of the API.
const liveTools = allTools.filter(t => 
    t.name !== 'captureScreenshot' && 
    t.name !== 'enableScreenshotPreview' &&
    t.name !== 'getChatHistory'
);

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
