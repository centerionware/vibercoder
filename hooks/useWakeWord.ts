import { useEffect, useRef, useCallback } from 'react';
import { UseWakeWordProps } from '../types';
import { Capacitor } from '@capacitor/core';
import { ensureMicrophonePermission } from '../utils/permissions';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

export const useWakeWord = ({ wakeWord, onWake, enabled, onPermissionError }: UseWakeWordProps): { stopAndRelease: () => Promise<void> } => {
  const recognitionRef = useRef<any | null>(null);
  const stopResolverRef = useRef<(() => void) | null>(null);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);


  const stopAndRelease = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (recognitionRef.current) {
        stopResolverRef.current = resolve;
        recognitionRef.current.stop();
      } else {
        resolve();
      }
    });
  }, []);

  const startListening = useCallback(async () => {
    if (!isSpeechRecognitionSupported) {
        onPermissionError("Your browser does not support the Web Speech API, which is required for the wake word feature. Please try a different browser like Chrome or Edge.");
        return;
    }

    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    
    try {
        const hasPermission = await ensureMicrophonePermission();
        if (!hasPermission) {
            const message = Capacitor.isNativePlatform()
                ? "Microphone permission is required for the wake word feature. Please enable it in the app settings."
                : "Microphone permission is required for the wake word feature. Please enable it in your browser's site settings.";
            onPermissionError(message);
            return; // Exit gracefully, preventing the restart loop.
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0])
            .map((result: any) => result.transcript)
            .join('');

          if (transcript.toLowerCase().includes(wakeWord.toLowerCase())) {
            console.log('Wake word detected!');
            onWake();
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed') {
            const message = Capacitor.isNativePlatform()
                ? "Microphone permission was denied. Please enable it in the app settings to use the wake word feature."
                : "Microphone permission was denied for the wake word listener. Please enable it in your browser's site settings (the padlock icon in the URL bar) and reload the page.";
            onPermissionError(message);
          } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
              console.error('Speech recognition error:', event.error);
          }
        };

        recognition.onend = () => {
          if (stopResolverRef.current) {
            const resolver = stopResolverRef.current;
            setTimeout(() => {
                resolver();
            }, 150);
            
            stopResolverRef.current = null;
            recognitionRef.current = null;
            return;
          }

          if (enabledRef.current) {
            console.log('Speech recognition service ended, restarting...');
            try {
              recognition.start();
            } catch (e) {
                console.warn('Could not restart recognition, may already be running.', e);
            }
          } else {
            console.log('Speech recognition service ended and will not restart as it is disabled.');
          }
        };

        recognition.start();
        recognitionRef.current = recognition;
        console.log('Wake word listener started.');
    } catch (e) {
        console.error("Failed to start speech recognition:", e);
        if (e instanceof Error && e.name === 'NotAllowedError') {
             const message = Capacitor.isNativePlatform()
                ? "Microphone permission was denied. Please enable it in the app settings to use the wake word feature."
                : "Microphone permission was denied. Please enable it in your browser's site settings (the padlock icon in the URL bar) and reload the page.";
             onPermissionError(message);
        }
    }
  }, [onWake, wakeWord, onPermissionError]);

  useEffect(() => {
    if (enabled) {
      startListening();
    } else {
      if (recognitionRef.current) {
        stopResolverRef.current = null;
        recognitionRef.current.stop();
      }
    }

    return () => {
      if (recognitionRef.current) {
        stopResolverRef.current = null;
        recognitionRef.current.stop();
      }
    };
  }, [enabled, startListening]);

  return { stopAndRelease };
};