import { Blob } from '@google/genai';

/**
 * Encodes raw bytes into a Base64 string.
 */
export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Decodes a Base64 string into raw bytes.
 */
export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decodes raw PCM audio data into an AudioBuffer for playback.
 * The browser's native `decodeAudioData` is designed for file formats (like MP3, WAV),
 * not raw audio streams, so we must manually construct the AudioBuffer.
 */
export async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Creates a Gemini API-compatible Blob from raw microphone audio data.
 */
export function createBlob(data: Float32Array): Blob {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Convert Float32 to Int16. This now matches the Gemini API guidelines precisely.
    int16[i] = data[i] * 32768;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    // The required audio format for the Live API
    mimeType: 'audio/pcm;rate=16000',
  };
}

/**
 * Plays a simple notification sound for user feedback.
 * @param type 'start' for activation, 'stop' for deactivation, 'thinking' for AI turn start, 'tool-call' for AI using a tool, 'ai-stop' for AI turn end, 'reconnect' for successful reconnection.
 * @param context The AudioContext to use for playback.
 * @returns A promise that resolves when the sound has finished playing.
 */
export const playNotificationSound = (type: 'start' | 'stop' | 'thinking' | 'tool-call' | 'ai-stop' | 'reconnect' = 'start', context: AudioContext | null): Promise<void> => {
  return new Promise((resolve) => {
    if (!context || context.state === 'closed') {
      console.warn("Cannot play notification sound: AudioContext is not available or closed.");
      resolve();
      return;
    }

    // Ensure the context is running, especially if it was suspended.
    if (context.state === 'suspended') {
      context.resume();
    }
    
    try {
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, context.currentTime + 0.01);

      if (type === 'reconnect') {
        // Chime: two quick notes for a distinct "reconnected" sound
        const firstNoteFreq = 1046.50; // C6
        const secondNoteFreq = 783.99; // G5
        const noteDuration = 0.1;
        const gap = 0.05;

        // First note
        oscillator.frequency.setValueAtTime(firstNoteFreq, context.currentTime);
        oscillator.start(context.currentTime);
        oscillator.stop(context.currentTime + noteDuration);

        // Second note (scheduled to play right after the first)
        const secondOscillator = context.createOscillator();
        const secondGain = context.createGain();
        secondOscillator.connect(secondGain);
        secondGain.connect(context.destination);
        
        const secondStartTime = context.currentTime + noteDuration + gap;
        secondGain.gain.setValueAtTime(0, secondStartTime);
        secondGain.gain.linearRampToValueAtTime(0.2, secondStartTime + 0.01);
        secondOscillator.frequency.setValueAtTime(secondNoteFreq, secondStartTime);

        secondOscillator.onended = () => resolve(); // Resolve when the second note finishes

        secondOscillator.start(secondStartTime);
        const secondEndTime = secondStartTime + noteDuration;
        secondGain.gain.exponentialRampToValueAtTime(0.00001, secondEndTime);
        secondOscillator.stop(secondEndTime);

      } else {
        // Standard logic for single-note sounds
        let frequency: number;
        let duration = 0.15;

        switch(type) {
            case 'start': frequency = 880; break; // A5
            case 'stop': frequency = 523.25; break; // C5
            case 'thinking': frequency = 659; duration = 0.08; break; // E5, short
            case 'tool-call': frequency = 1318; duration = 0.1; break; // E6, chime
            case 'ai-stop': frequency = 440; duration = 0.15; break; // A4
            default: frequency = 880;
        }
        
        oscillator.frequency.setValueAtTime(frequency, context.currentTime);
        oscillator.onended = () => resolve();

        oscillator.start(context.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + duration);
        oscillator.stop(context.currentTime + duration);
      }
    } catch (e) {
      console.error("Could not play notification sound:", e);
      resolve(); // Resolve even on error to not block the calling function.
    }
  });
};