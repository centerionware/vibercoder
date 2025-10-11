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
 * @param type 'start' for activation, 'stop' for deactivation.
 * @param context The AudioContext to use for playback.
 * @returns A promise that resolves when the sound has finished playing.
 */
export const playNotificationSound = (type: 'start' | 'stop' = 'start', context: AudioContext | null): Promise<void> => {
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
      // Create oscillator and gain node
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      // Resolve the promise when the sound has finished playing.
      oscillator.onended = () => resolve();

      // Set volume (gain)
      gainNode.gain.setValueAtTime(0, context.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, context.currentTime + 0.01); // Quick ramp up to avoid clicks

      // Set frequency based on type
      if (type === 'start') {
          oscillator.frequency.setValueAtTime(880, context.currentTime); // A5 note for activation
      } else {
          oscillator.frequency.setValueAtTime(523.25, context.currentTime); // C5 note for deactivation
      }

      // Schedule start and stop
      oscillator.start(context.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.00001, context.currentTime + 0.2); // Fade out over 0.2s
      oscillator.stop(context.currentTime + 0.2);
    } catch (e) {
      console.error("Could not play notification sound:", e);
      resolve(); // Resolve even on error to not block the calling function.
    }
  });
};