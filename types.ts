import { GoogleGenAI, Chat, Content as SdkGeminiContent, FunctionCall as SdkFunctionCall, Part } from '@google/genai';
import React from 'react';

// General App State
export enum View {
  Code = 'code',
  Preview = 'preview',
  Ai = 'ai',
  Git = 'git',
  Settings = 'settings',
  Prompts = 'prompts',
}

export interface AppSettings {
  apiKey: string;
  aiModel: string;
  liveAiModel: string;
  voiceName: string;
  thinkingBudget: number | null;
  // Global Git settings act as a fallback
  gitRemoteUrl: string;
  gitUserName: string;
  gitUserEmail: string;
  gitAuthToken: string; // Fallback token
  gitCorsProxy: string;
  wakeWord: string;
  wakeWordEnabled: boolean;
  autoEnableLiveMode: boolean;
}

export interface Project {
    id: string;
    name: string;
    entryPoint: string;
    gitRemoteUrl: string;
    createdAt: number;
    // Per-project Git settings override global settings
    gitSettings?: GitSettings;
}

export interface GitSettings {
  source: 'global' | 'default' | 'specific' | 'custom';
  credentialId?: string; // For 'specific' source
  custom?: { // For 'custom' source
    userName: string;
    userEmail: string;
    authToken: string;
    corsProxy: string;
  };
}

export interface GitCredential {
    id: string;
    name: string;
    token: string;
    isDefault?: boolean;
}


// AI Chat & Live Session
export interface AiMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  thinking?: string | null;
  toolCalls?: ToolCall[];
  attachments?: Attachment[];
  isLive?: boolean;
}

export enum ToolCallStatus {
  IN_PROGRESS = 'in_progress',
  SUCCESS = 'success',
  ERROR = 'error',
  CANCELLED = 'cancelled',
}

export interface ToolCall {
  id: string;
  name: string;
  args: any;
  status: ToolCallStatus;
}

export interface Attachment {
  type: 'image' | 'video';
  data: string; // Base64 for image, URL for video
}

export interface ChatThread {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  messages: AiMessage[];
  history: GeminiContent[];
  shortTermMemory: ShortTermMemory;
}

export interface ShortTermMemory {
    [key: string]: {
        value: any;
        priority: 'low' | 'medium' | 'high';
        createdAt: number;
        lastAccessedAt: number;
    }
}

// Re-exporting Gemini types to avoid direct SDK imports everywhere
export type GeminiContent = SdkGeminiContent;
export type GeminiFunctionCall = SdkFunctionCall;

// AI Hook Props
export interface UseAiChatProps {
  aiRef: React.RefObject<GoogleGenAI | null>;
  settings: AppSettings;
  activeThread: ChatThread | undefined;
  toolImplementations: Record<string, (args: any) => Promise<any>>;
  addMessage: (message: AiMessage) => void;
  updateMessage: (id: string, updates: Partial<AiMessage>) => void;
  updateHistory: (newHistory: GeminiContent[]) => void;
  updateThread: (threadId: string, updates: Partial<ChatThread>) => void;
  onStartAiRequest: () => void;
  onEndAiRequest: () => void;
}

export interface LiveSessionControls {
    pauseListening: (durationInSeconds: number, options?: { immediate?: boolean }) => void;
    stopLiveSession: (options?: { immediate?: boolean }) => void;
    enableVideoStream: () => void;
    disableVideoStream: () => void;
}

export interface UseAiLiveProps {
  aiRef: React.RefObject<GoogleGenAI | null>;
  settings: AppSettings;
  activeThread: ChatThread | undefined;
  toolImplementations: Record<string, (args: any) => Promise<any>>;
  addMessage: (message: AiMessage) => void;
  updateMessage: (id: string, updates: Partial<AiMessage>) => void;
  onPermissionError: (message: string) => void;
  activeView: View;
  setLiveFrameData: (data: string | null) => void;
  onStartAiRequest: () => void;
  onEndAiRequest: () => void;
}

export interface UseWakeWordProps {
    wakeWord: string;
    onWake: () => void;
    enabled: boolean;
    onPermissionError: (message: string) => void;
}

// AI Virtual File System (VFS)
export const DELETED_FILE_SENTINEL = { DELETED: true as const };
export type VFSMutation = string | typeof DELETED_FILE_SENTINEL;

export interface CopyOnWriteVFS {
  originalFiles: Readonly<Record<string, string>>;
  mutations: Record<string, VFSMutation>;
}


// Tool Orchestrator
export interface ToolImplementationsDependencies {
  // File System
  files: Record<string, string>;
  setFiles: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  activeFile: string | null;
  setActiveFile: (filename: string | null) => void;
  // AI Virtual File System (VFS)
  getOriginalHeadFiles: () => Record<string, string> | null;
  getAiVirtualFiles: () => CopyOnWriteVFS | null;
  setAiVirtualFiles: (updater: React.SetStateAction<CopyOnWriteVFS | null>) => void;
  getVfsReadyPromise: () => Promise<void>;
  onCommitAiToHead: () => void;
  // App Control
  activeView: View;
  setActiveView: (view: View) => void;
  bundleLogs: string[];
  sandboxErrors: string[];
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  liveSessionControls: LiveSessionControls;
  setScreenshotPreview: (dataUrl: string | null) => void;
  isScreenshotPreviewDisabled: boolean;
  setIsScreenshotPreviewDisabled: React.Dispatch<React.SetStateAction<boolean>>;
  // Memory & Threads
  threads: ChatThread[];
  activeThread: ChatThread | undefined;
  updateThread: (threadId: string, updates: Partial<ChatThread>) => void;
  // Creative
  aiRef: React.RefObject<GoogleGenAI | null>;
  // Git
  gitServiceRef: React.RefObject<GitService | null>;
  onGitPush: () => Promise<void>;
  onGitPull: (rebase: boolean) => Promise<void>;
  onGitRebase: (branch: string) => Promise<void>;
  onDiscardChanges: () => Promise<void>;
  setCommitMessage: React.Dispatch<React.SetStateAction<string>>;
  // Project Management
  projects: Project[];
  gitCredentials: GitCredential[];
  // Prompt Management
  prompts: Prompt[];
  createPrompt: (id: string, description: string, content: string) => Promise<void>;
  updatePrompt: (id: string, content: string, author: 'user' | 'ai') => Promise<void>;
  deletePrompt: (id: string) => Promise<void>;
}

// Prompt Management
export interface PromptVersion {
  versionId: string;
  content: string;
  createdAt: number;
  author: 'user' | 'ai';
}

export interface Prompt {
  id: string; // The "key" or unique name of the prompt
  description: string;
  versions: PromptVersion[];
  currentVersionId: string;
  createdAt: number;
}


// Git Service
export interface GitService {
    isReal: boolean;
    clone(url: string, onProgress?: (progress: GitProgress) => void): Promise<void>;
    status(appFiles: Record<string, string>, changedFilePaths?: string[]): Promise<GitStatus[]>;
    commit(message: string, appFiles: Record<string, string>): Promise<{ oid: string }>;
    log(ref?: string): Promise<GitCommit[]>;
    listBranches(): Promise<string[]>;
    checkout(branch: string): Promise<{ files: Record<string, string> }>;
    getCommitChanges(oid: string): Promise<GitFileChange[]>;
    readFileAtCommit(oid: string, filepath: string): Promise<string | null>;
    getHeadFiles(): Promise<Record<string, string>>;
    push(onProgress?: (progress: GitProgress) => void): Promise<{ ok: boolean, error?: string }>;
    pull(rebase: boolean, onProgress?: (progress: GitProgress) => void): Promise<void>;
    rebase(branch: string): Promise<void>;
    getWorkingDirFiles(): Promise<Record<string, string>>;
    writeFile(filepath: string, content: string): Promise<void>;
    removeFile(filepath: string): Promise<void>;
}

export enum GitFileStatus {
    Unmodified,
    Modified,
    New,
    Deleted,
}

export interface GitStatus {
    filepath: string;
    status: GitFileStatus;
}

export interface GitCommit {
    oid: string;
    message: string;
    author: GitAuthor & { timestamp: number };
    parent: string[];
}

export interface GitAuthor {
    name: string;
    email: string;
}

export interface DiffLine {
    type: 'add' | 'del' | 'eql';
    content: string;
}

export interface GitFileChange {
    filepath: string;
    status: 'added' | 'deleted' | 'modified';
    diff?: DiffLine[];
    isBinary?: boolean;
    isTooLarge?: boolean;
}

export interface GitProgress {
    phase: string;
    loaded: number;
    total: number;
}

// Preview Sandbox
export interface PreviewState {
    htmlContent: string;
    videoFrameDataUrl: string | null;
    videoFrameRect: DOMRect | null;
}

// Debugging
export interface LogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

// Isomorphic Git HTTP client types for Electron proxy
export interface GitHttpRequest {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: AsyncIterable<Uint8Array>;
}
export interface GitHttpResponse {
    url: string;
    statusCode: number;
    statusMessage: string;
    headers: Record<string, string>;
    body: AsyncIterable<Uint8Array>;
}