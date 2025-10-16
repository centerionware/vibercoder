import React from 'react';
import { createBlob } from '../../utils/audio';
import { AudioContextRefs, SessionRefs } from './types';
import { UseAiLiveProps } from '../../types';

const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

/**
 * Creates and configures the ScriptProcessorNode for a session.
 * It does NOT connect the microphone source to it; that is handled dynamically.
 * The onaudioprocess handler is now "dumb" - if it fires, it sends data.
 */
export const setupScriptProcessor = (
    audioRefs: React.MutableRefObject<AudioContextRefs>,
    sessionRefs: React.MutableRefObject<SessionRefs>
) => {
    const { input } = audioRefs.current;
    if (!input) {
        console.error("Cannot set up script processor: input context is missing.");
        return;
    }

    // Disconnect any old processor before creating a new one
    if (audioRefs.current.scriptProcessor) {
        try {
            audioRefs.current.scriptProcessor.disconnect();
        } catch (e) {
            console.warn("Could not disconnect old script processor:", e);
        }
    }

    const scriptProcessor = input.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
    
    scriptProcessor.onaudioprocess = (event) => {
        // This callback now only runs if the mic source is physically connected to this processor.
        // Therefore, we can unconditionally send the data to the AI without any state checks.
        const inputData = event.inputBuffer.getChannelData(0);
        const pcmBlob = createBlob(inputData);
        sessionRefs.current.sessionPromise?.then((session) => {
            session.sendRealtimeInput({ media: pcmBlob });
        }).catch(console.error);
    };
    
    // Connect the processor to the destination to allow it to run,
    // but the mic source is not yet connected to it.
    scriptProcessor.connect(input.destination);
    audioRefs.current.scriptProcessor = scriptProcessor;
};

/**
 * Connects the microphone source to the script processor, allowing audio to flow to the AI.
 */
export const connectMicSourceToProcessor = (audioRefs: React.MutableRefObject<AudioContextRefs>) => {
    const { micSourceNode, scriptProcessor } = audioRefs.current;
    if (micSourceNode && scriptProcessor) {
        try {
            micSourceNode.connect(scriptProcessor);
            console.log("[Audio Pipe] Mic connected to AI stream.");
        } catch (e) {
            console.warn("Could not connect mic source to processor, it may already be connected.", e);
        }
    }
};

/**
 * Disconnects the microphone source from the script processor, stopping audio flow to the AI.
 */
export const disconnectMicSourceFromProcessor = (audioRefs: React.MutableRefObject<AudioContextRefs>) => {
    const { micSourceNode, scriptProcessor } = audioRefs.current;
    if (micSourceNode && scriptProcessor) {
        try {
            micSourceNode.disconnect(scriptProcessor);
            console.log("[Audio Pipe] Mic disconnected from AI stream.");
        } catch (e) {
            // This error is expected if it's already disconnected, so we can ignore it.
        }
    }
};

/**
 * Stops an active session, with an option to keep the microphone stream active for a hot-swap.
 */
export const stopAudioProcessing = async (
    audioRefs: React.MutableRefObject<AudioContextRefs>,
    sessionRefs: React.MutableRefObject<SessionRefs>,
    options: { keepMicActive: boolean }
) => {
    const { scriptProcessor, micSourceNode, output } = audioRefs.current;
    
    scriptProcessor?.disconnect();
    audioRefs.current.scriptProcessor = null;

    if (options.keepMicActive) {
        micSourceNode?.disconnect();
    } else {
        const { micStream } = audioRefs.current;
        micStream?.getTracks().forEach(track => {
            if (track.readyState === 'live') {
                track.stop();
            }
        });
        micSourceNode?.disconnect();
        audioRefs.current.micStream = null;
        audioRefs.current.micSourceNode = null;
        console.log("Microphone stream and source node cleaned up for full stop.");
    }

    if (output) {
        for (const source of sessionRefs.current.audioQueue.values()) {
            try { source.stop(); } catch(e) {}
        }
    }
    sessionRefs.current.audioQueue.clear();
};