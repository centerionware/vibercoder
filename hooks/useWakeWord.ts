import { useEffect, useRef, useCallback } from 'react';
import { UseWakeWordProps } from '../types';
import { Capacitor } from '@capacitor/core';
import { requestMicrophonePermission } from '../utils/permissions';

const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const isSpeechRecognitionSupported = !!SpeechRecognition;

export const useWakeWord = ({ wakeWord, onWake, enabled, onPermissionError }: UseWakeWordProps): { stopAndRelease: () => Promise<void> } => {
  const recognitionRef = useRef<any | null>(null);
  const stopResolverRef = useRef<(() => void) | null>(null);
  const isStoppingRef = useRef(false);

  // Use refs for callbacks to avoid including them in the main useEffect dependency array, making the effect more stable.
  const onWakeRef = useRef(onWake);
  useEffect(() => { onWakeRef.current = onWake; }, [onWake]);

  const onPermissionErrorRef = useRef(onPermissionError);
  useEffect(() => { onPermissionErrorRef.current = onPermissionError; }, [onPermissionError]);

  const stopAndRelease = useCallback((): Promise<void> => {
    return new Promise((resolve) => {
      if (recognitionRef.current) {
        isStoppingRef.current = true;
        stopResolverRef.current = resolve;
        recognitionRef.current.stop();
      } else {
        // If there's no recognition instance, we can resolve immediately.
        resolve();
      }
    });
  }, []);

  useEffect(() => {
    if (!enabled) {
      // If the feature is disabled, ensure any running instance is stopped.
      stopAndRelease();
      return;
    }

    // This function is responsible for creating and starting a new recognition instance.
    const start = async () => {
      // Don't start a new instance if one is already running or if we are in the process of stopping.
      if (recognitionRef.current || isStoppingRef.current) {
        return;
      }

      if (!isSpeechRecognitionSupported) {
        onPermissionErrorRef.current("Your browser does not support the Web Speech API, which is required for the wake word feature. Please try a different browser like Chrome or Edge.");
        return;
      }

      try {
        const hasPermission = await requestMicrophonePermission();
        if (!hasPermission) {
          const message = Capacitor.isNativePlatform()
            ? "Microphone permission is required for the wake word feature. Please enable it in the app settings."
            : "Microphone permission is required for the wake word feature. Please enable it in your browser's site settings.";
          onPermissionErrorRef.current(message);
          return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition; // Store the new instance in the ref.

        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results).map((result: any) => result[0]).map((result: any) => result.transcript).join('');
          if (transcript.toLowerCase().includes(wakeWord.toLowerCase())) {
            console.log('Wake word detected!');
            // We stop the recognition to prevent multiple triggers. The onend handler will take care of restarting it.
            recognition.stop();
            onWakeRef.current();
          }
        };

        recognition.onerror = (event: any) => {
          if (event.error === 'not-allowed') {
            const message = Capacitor.isNativePlatform()
              ? "Microphone permission was denied. Please enable it in the app settings to use the wake word feature."
              : "Microphone permission was denied for the wake word listener. Please enable it in your browser's site settings (the padlock icon in the URL bar) and reload the page.";
            onPermissionErrorRef.current(message);
          } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
            console.error('Speech recognition error:', event.error);
          }
        };

        recognition.onend = () => {
          recognitionRef.current = null; // The instance is now dead.
          
          if (isStoppingRef.current) {
            // This was a manual stop. Resolve the promise and clean up.
            if (stopResolverRef.current) {
              stopResolverRef.current();
              stopResolverRef.current = null;
            }
            isStoppingRef.current = false; // Reset for next time.
          } else {
            // This was a natural end (e.g., wake word detected, no speech, network error).
            // We should restart it to keep listening.
            console.log('Speech recognition service ended, restarting...');
            // Use a small delay to prevent a tight loop if an error causes `onend` to fire immediately.
            setTimeout(start, 100);
          }
        };

        isStoppingRef.current = false; // Ensure we are not in a stopping state before starting.
        recognition.start();
        console.log('Wake word listener started.');

      } catch (e) {
        console.error("Failed to start speech recognition:", e);
        if (e instanceof Error && e.name === 'NotAllowedError') {
          const message = Capacitor.isNativePlatform()
            ? "Microphone permission was denied. Please enable it in the app settings to use the wake word feature."
            : "Microphone permission was denied. Please enable it in your browser's site settings (the padlock icon in the URL bar) and reload the page.";
          onPermissionErrorRef.current(message);
        }
      }
    };

    start();

    // The cleanup function for this effect. This will run when `enabled` becomes false or when the component unmounts.
    return () => {
      stopAndRelease();
    };
  }, [enabled, wakeWord, stopAndRelease]); // Main dependencies that should trigger a full restart.

  return { stopAndRelease };
};
