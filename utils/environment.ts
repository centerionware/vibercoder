import { Capacitor } from '@capacitor/core';

// Extend the Window interface to include the property exposed by Electron's preload script.
declare global {
  interface Window {
    electron?: {
      isElectron: boolean;
    };
  }
}

/**
 * Checks if the application is running in a native environment (Capacitor or Electron)
 * where CORS restrictions do not apply for server requests.
 * @returns {boolean} True if in a native environment, false otherwise.
 */
export const isNativeEnvironment = (): boolean => {
  return Capacitor.isNativePlatform() || !!window.electron?.isElectron;
};
