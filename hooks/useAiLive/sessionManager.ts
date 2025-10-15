// Fix: Add missing import for React to use React-specific types like RefObject.
import React from 'react';
import { Modality, GoogleGenAI } from '@google/genai';
import { AppSettings, ChatThread } from '../../types';
import { allTools } from '../../services/toolOrchestrator';

// This new, flexible system instruction promotes a "cognitive cycle" for the live session.
// This ensures consistent behavior between the text and voice interfaces.
const liveSystemInstruction = `You are Vibe, an autonomous AI agent in a real-time voice conversation. Your purpose is to fulfill user requests by executing tools efficiently. **Your responses must be direct and concise. Prioritize action over conversation.** For every new task, you MUST follow this cognitive cycle:

1.  **Orient:** Call \`viewShortTermMemory\` to check for an 'active_task' and 'active_protocols'.
    *   If both exist, you are continuing a task. Use the protocols from your memory to guide your next step. Proceed to step 5.
    *   If they don't exist, you are starting a new task. Proceed to step 2.

2.  **Analyze & Review Skills:** Understand the user's goal from their speech. Call \`listPrompts()\` to see your library of available protocols.

3.  **Select & Load Knowledge:** Based on the user's request, call \`readPrompts()\` with the keys for the most relevant protocol(s) (e.g., 'full_stack_development_protocol').

4.  **Memorize Knowledge:** You MUST immediately call \`updateShortTermMemory()\` to store the full, combined content of the protocols you just read under the key 'active_protocols'. This is your instruction set for the entire task.

5.  **Formulate a Plan:**
    *   If this is a new task, use \`think()\` to create a high-level plan, then call \`updateShortTermMemory()\` to set the 'active_task'.
    *   If continuing a task, use \`think()\` to outline the single, specific next step.

6.  **Execute:** Carry out your plan, following the instructions from your 'active_protocols' in memory.`;


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