import React from 'react';
import { Part as GeminiPart } from '@google/genai';
import { GoogleGenAI } from '@google/genai'; // For aiRef

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

// FIX: Defined GeminiFunctionCall locally to fix import error.
export interface GeminiFunctionCall {
    // FIX: `name` and `args` are optional to support streaming function calls where parts may arrive separately.
    name?: string;
    args?: { [key: string]: any };
    id?: string;
}

export enum View {
  Code = 'code',
  Preview = 'preview',
  Ai = 'ai',
  Git = 'git',
  Settings = 'settings',
}

export enum AiProvider {
  Google = 'google',
  Anthropic = 'anthropic',
  OpenAI = 'openai',
}

export interface AppSettings {
  aiProvider: AiProvider;
  aiModel: string;
  geminiApiKey: string; // The user-provided API key
  voiceName: string; // Added to support selectable voices
  aiEndpoint: string;
  gitRemoteUrl: string;
  gitUserName: string;
  gitUserEmail: string;
  gitProxyUrl: string; // Added to store the user's CORS proxy URL
  thinkingBudget?: number;
}

export enum ToolCallStatus {
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  ERROR = 'error',
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
  status: ToolCallStatus;
}

export interface Attachment {
    type: 'image' | 'video';
    data: string; // base64 for image, url for video
}

export interface AiMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  toolCalls?: ToolCall[];
  thinking?: string | null;
  attachments?: Attachment[];
  isLive?: boolean; // For real-time transcription UI
  // FIX: Properties are optional to match `GenerateContentResponseUsageMetadata` from the Gemini API.
  usageMetadata?: {
    promptTokenCount?: number;
    candidatesTokenCount?: number;
    totalTokenCount?: number;
  }
}

export interface ShortTermMemory {
  [key: string]: {
    value: any;
    createdAt: number;
    lastAccessedAt: number;
    priority: 'low' | 'medium' | 'high';
  };
}

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  messages: AiMessage[];
  history: GeminiContent[];
  shortTermMemory: ShortTermMemory;
}

export interface LiveSessionControls {
    stopLiveSession: (options?: { immediate?: boolean; isUnmount?: boolean }) => void;
    pauseListening: (durationInSeconds: number, options?: { immediate?: boolean }) => void;
    enableVideoStream: () => void;
    disableVideoStream: () => void;
}

// Data structure for the state captured from the preview iframe
export interface PreviewState {
    videoFrameDataUrl: string | null;
    videoFrameRect: DOMRect | null;
    htmlContent: string | null;
}

// Dependencies for tool implementations
export interface ToolImplementationsDependencies {
    files: Record<string, string>;
    onWriteFile: (filename: string, content: string) => void;
    onRemoveFile: (filename: string) => void;
    aiRef: React.RefObject<GoogleGenAI | null>;
    setActiveView: (view: View) => void;
    setActiveFile: (filename: string | null) => void;
    activeFile: string | null;
    bundleLogs: string[];
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    threads: ChatThread[];
    activeThread: ChatThread | undefined;
    updateThread: (threadId: string, updates: Partial<ChatThread>) => void;
    sandboxErrors: string[];
    changedFiles: string[];
    liveSessionControls: LiveSessionControls;
    activeView: View;
    setScreenshotPreview: React.Dispatch<React.SetStateAction<string | null>>;
    isScreenshotPreviewDisabled: boolean;
    setIsScreenshotPreviewDisabled: React.Dispatch<React.SetStateAction<boolean>>;
}

// FIX: Added UseAiChatProps interface for useAiChat hook.
export interface UseAiChatProps {
    aiRef: React.RefObject<GoogleGenAI | null>;
    settings: AppSettings;
    activeThread: ChatThread | undefined;
    toolImplementations: Record<string, (args: any) => Promise<any>>;
    addMessage: (message: AiMessage) => void;
    updateMessage: (id: string, updates: Partial<AiMessage>) => void;
    updateHistory: (newHistory: GeminiContent[]) => void;
    updateThread: (threadId: string, updates: Partial<ChatThread>) => void;
}

export interface UseAiLiveProps {
    aiRef: React.RefObject<GoogleGenAI | null>;
    settings: AppSettings;
    addMessage: (message: AiMessage) => void;
    updateMessage: (id: string, updates: Partial<AiMessage>) => void;
    toolImplementations: Record<string, (args: any) => Promise<any>>;
    activeThread: ChatThread | undefined;
    updateHistory: (newHistory: GeminiContent[]) => void;
    onPermissionError: (message: string) => void;
    // FIX: Add activeView to the props for the useAiLive hook.
    activeView: View;
    setLiveFrameData: React.Dispatch<React.SetStateAction<string | null>>;
}

// FIX: Added UseWakeWordProps to define props for the useWakeWord hook.
export interface UseWakeWordProps {
    wakeWord: string;
    onWake: () => void;
    enabled: boolean;
    onPermissionError: (message: string) => void;
}

// --- Git Service Types ---
export enum GitFileStatus {
  Unmodified = 'unmodified',
  New = 'new',
  Modified = 'modified',
  Deleted = 'deleted',
  Absorb = 'absorb', // For untracked files
}

export interface GitStatus {
  filepath: string;
  status: GitFileStatus;
}

export interface GitAuthor {
  name: string;
  email: string;
}

export interface GitService {
  isReal: boolean;
  clone(url: string, proxyUrl: string, author: GitAuthor): Promise<{ files: Record<string, string> }>;
  status(files: Record<string, string>, changedFilePaths?: string[]): Promise<GitStatus[]>;
  commit(message: string, author: GitAuthor, files: Record<string, string>): Promise<{ oid: string }>;
}