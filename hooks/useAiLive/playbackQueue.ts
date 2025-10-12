// Fix: Added missing import for React to use React-specific types.
import React from 'react';
import { decode, decodeAudioData } from '../../utils/audio';
import { AudioContextRefs, SessionRefs } from './types';

export const playAudioChunk = async (
    base64Audio: string,
    audioRefs: React.MutableRefObject<AudioContextRefs>,
    sessionRefs: React.MutableRefObject<SessionRefs>,
    setIsSpeaking: React.Dispatch<React.SetStateAction<boolean>>
) => {
    const { output } = audioRefs.current;
    if (!output) return;

    setIsSpeaking(true);
    
    const { audioQueue } = sessionRefs.current;
    let { nextStartTime } = sessionRefs.current;

    nextStartTime = Math.max(nextStartTime, output.currentTime);

    const audioBuffer = await decodeAudioData(decode(base64Audio), output, 24000, 1);
    const source = output.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(output.destination);
    
    source.addEventListener('ended', () => {
        audioQueue.delete(source);
        if (audioQueue.size === 0) {
            setIsSpeaking(false);
        }
    });
    
    source.start(nextStartTime);
    sessionRefs.current.nextStartTime = nextStartTime + audioBuffer.duration;
    audioQueue.add(source);
};

export const interruptPlayback = (sessionRefs: React.MutableRefObject<SessionRefs>) => {
    for (const source of sessionRefs.current.audioQueue.values()) {
        try { source.stop(); } catch(e) {}
    }
    sessionRefs.current.audioQueue.clear();
    sessionRefs.current.nextStartTime = 0;
};