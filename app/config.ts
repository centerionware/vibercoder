import { AppSettings } from '../types';

// This file contains the default configuration for the application.
// Modifying these values will change the application's default behavior for new users.

export const DEFAULT_SETTINGS: AppSettings = {
  apiKey: process.env.API_KEY || '',
  aiModel: 'gemini-2.5-flash',
  // Set the officially documented model for real-time audio.
  liveAiModel: 'gemini-2.5-flash-native-audio-preview-09-2025',
  voiceName: 'Zephyr',
  thinkingBudget: null,
  gitRemoteUrl: '',
  gitUserName: 'Vibercoder',
  gitUserEmail: 'vibercoder@git.great',
  gitAuthToken: '',
  gitCorsProxy: 'https://cors.isomorphic-git.org',
  wakeWord: 'hey vibe',
  // Default wake word to disabled as requested.
  wakeWordEnabled: false,
  autoEnableLiveMode: false,
};
