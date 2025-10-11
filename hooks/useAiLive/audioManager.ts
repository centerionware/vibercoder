import { createBlob } from '../../utils/audio';
import { AudioContextRefs, SessionRefs } from './types';

const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

/**
 * Creates a new ScriptProcessor and connects the existing microphone source to it.
 * This is called for every new session, whether it's a cold start or a hot-swap.
 */
export const connectMicrophoneNodes = (
    audioRefs: React.MutableRefObject<AudioContextRefs>,
    sessionRefs: React.MutableRefObject<SessionRefs>,
    isMuted: boolean
) => {
    const { micSourceNode, input } = audioRefs.current;
    if (!micSourceNode || !input) {
        console.error("Cannot connect microphone nodes: audio source or input context is missing.");
        return;
    }

    const scriptProcessor = input.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
    
    scriptProcessor.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        if (!isMuted) {
            const pcmBlob = createBlob(inputData);
            sessionRefs.current.sessionPromise?.then((session) => {
                session.sendRealtimeInput({ media: pcmBlob });
            }).catch(console.error);
        }
    };
    
    micSourceNode.connect(scriptProcessor);
    scriptProcessor.connect(input.destination);

    audioRefs.current.scriptProcessor = scriptProcessor;
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
    
    // Always disconnect the processor for the old session.
    scriptProcessor?.disconnect();
    audioRefs.current.scriptProcessor = null;

    if (options.keepMicActive) {
        // For hot-swaps, just disconnect the source node from the old processor.
        // The source node itself (and the underlying mic stream) remains active.
        micSourceNode?.disconnect();
    } else {
        // --- FIX FOR MANUAL STOP ---
        // For a full stop, perform a direct and robust teardown of all mic resources.
        const { micStream } = audioRefs.current;
        
        // 1. Forcefully stop all tracks on the stream.
        micStream?.getTracks().forEach(track => {
            if (track.readyState === 'live') {
                track.stop();
            }
        });

        // 2. Disconnect the source node from the audio graph.
        micSourceNode?.disconnect();

        // 3. Null out the references to allow for a clean restart.
        audioRefs.current.micStream = null;
        audioRefs.current.micSourceNode = null;
        console.log("Microphone stream and source node cleaned up for full stop.");
    }

    // Clean up any pending audio playback.
    if (output) {
        for (const source of sessionRefs.current.audioQueue.values()) {
            try { source.stop(); } catch(e) {}
        }
    }
    sessionRefs.current.audioQueue.clear();
};