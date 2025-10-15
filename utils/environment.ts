import { Capacitor } from '@capacitor/core';
import { GitHttpRequest, GitHttpResponse } from '../types';

// Extend the Window interface to include the property exposed by Electron's preload script.
declare global {
  interface Window {
    electron?: {
      isElectron: boolean;
      // Expose a custom http client that matches the interface required by isomorphic-git
      git: {
        request: (request: GitHttpRequest) => Promise<GitHttpResponse>;
      }
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

// --- Safe localStorage Wrapper ---

const isLocalStorageAvailable = (): boolean => {
    try {
        // Check if localStorage is not only present but also accessible.
        const testKey = '__test_localStorage_availability__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch (e) {
        console.warn("localStorage is not available in this environment. State will not be persisted across sessions.");
        return false;
    }
};

const storageAvailable = isLocalStorageAvailable();

export const safeLocalStorage = {
    getItem: (key: string): string | null => {
        if (!storageAvailable) {
            return null;
        }
        return localStorage.getItem(key);
    },
    setItem: (key: string, value: string): void => {
        if (storageAvailable) {
            localStorage.setItem(key, value);
        }
    },
    clear: (): void => {
        if (storageAvailable) {
            localStorage.clear();
        }
    },
};
