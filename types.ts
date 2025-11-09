import { Content, FunctionCall } from '@google/genai';
import React from 'react';

// --- Core App ---

export enum View {
  Code = 'code',
  Preview = 'preview',
  Ai = 'ai',
  Git = 'git',
  Settings = 'settings',
  Prompts = 'prompts',
  Browser = 'browser',
}

export interface AppSettings {
  apiKey: string;
  aiModel: string;
  liveAiModel: string;
  voiceName: string;
  thinkingBudget: number | null;
  gitRemoteUrl: string;
  gitUserName: string;
  gitUserEmail: string;
  gitAuthToken: string;
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
  gitSettings: GitSettings;
}

export interface ProjectFile {
    id?: number;
    projectId: string;
    filepath: string;
    content: string;
}

// --- AI & Chat ---

export interface ChatThread {
  id: string;
  projectId: string;
  title: string;
  createdAt: number;
  messages: AiMessage[];
  history: GeminiContent[];
  shortTermMemory: ShortTermMemory;
}

export interface AiMessage {
  id: string;
  role: 'user' | 'model';
  content: string;
  thinking?: string | null;
  thinkingContent?: string | null;
  toolCalls?: ToolCall[];
  isLive?: boolean;
  attachments?: Attachment[];
  tokenCount?: number;
}

export interface Attachment {
  type: 'image' | 'video';
  data: string; // base64 for image, URL for video
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

export type GeminiContent = Content;

export type GeminiFunctionCall = FunctionCall;

export interface UseAiChatProps {
  aiRef: React.RefObject<any>; // GoogleGenAI
  settings: AppSettings;
  activeThread: ChatThread | undefined;
  addMessage: (message: AiMessage) => void;
  updateMessage: (id: string, updates: Partial<AiMessage>) => void;
  updateHistory: (newHistory: GeminiContent[]) => void;
  toolImplementations: Record<string, (args: any) => Promise<any>>;
  onStartAiRequest: () => void;
  onEndAiRequest: () => void;
}

export interface LiveSessionControls {
    startLiveSession: () => Promise<boolean>;
    stopLiveSession: (options?: { immediate?: boolean; isUnmount?: boolean }) => void;
    toggleMute: () => void;
    pauseListening: (durationInSeconds: number, options?: { immediate?: boolean }) => void;
    interrupt: () => void;
    enableVideoStream: () => void;
    disableVideoStream: () => void;
    setAudioPipe: (target: 'ai' | 'none') => void;
}

export interface UseAiLiveProps extends UseAiChatProps {
    activeView: View;
    onPermissionError: (message: string) => void;
    setLiveFrameData: (data: string | null) => void;
}

// --- Short Term Memory ---
export interface ShortTermMemoryItem {
    value: any;
    priority: 'low' | 'medium' | 'high';
    createdAt: number;
    lastAccessedAt: number;
}
export type ShortTermMemory = Record<string, ShortTermMemoryItem>;


// --- Git ---

export interface GitAuthor {
  name: string;
  email: string;
}

export interface GitCredential {
  id: string;
  name: string;
  token: string;
  isDefault: boolean;
}

export enum GitFileStatus {
    New = 'new',
    Modified = 'modified',
    Deleted = 'deleted',
    Unmodified = 'unmodified',
}

export interface GitStatus {
  filepath: string;
  status: GitFileStatus;
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

export interface GitCommit {
    oid: string;
    message: string;
    author: {
        name: string;
        email: string;
        timestamp: number;
    };
    parent: string[];
}

export interface GitProgress {
    phase: string;
    loaded: number;
    total: number;
}

export interface GitHttpRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: AsyncIterable<Uint8Array>;
}

export interface GitHttpResponse {
  url: string;
  method: string;
  statusCode: number;
  statusMessage: string;
  body: AsyncIterable<Uint8Array>;
  headers: Record<string, string>;
}

export interface GitSettings {
  source: 'global' | 'default' | 'specific' | 'custom';
  credentialId?: string;
  custom?: {
    userName: string;
    userEmail: string;
    authToken: string;
  };
}

export interface GitService {
    isReal: boolean;
    clone(url: string, onProgress?: (progress: GitProgress) => void): Promise<{ files: Record<string, string> }>;
    status(appFiles: Record<string, string>): Promise<GitStatus[]>;
    commit(message: string, appFiles: Record<string, string>): Promise<{ oid: string, status: GitStatus[] }>;
    log(ref?: string): Promise<GitCommit[]>;
    listBranches(): Promise<string[]>;
    checkout(branch: string): Promise<{ files: Record<string, string> }>;
    getCommitChanges(oid: string): Promise<GitFileChange[]>;
    readFileAtCommit(oid: string, filepath: string): Promise<string | null>;
    getHeadFiles(): Promise<Record<string, string>>;
    push(onProgress?: (progress: GitProgress) => void): Promise<{ ok: boolean, error?: string }>;
    pull(rebase: boolean, onProgress?: (progress: GitProgress) => void): Promise<{ files: Record<string, string>, status: GitStatus[] }>;
    rebase(branch: string): Promise<{ files: Record<string, string>, status: GitStatus[] }>;
    getWorkingDirFiles(): Promise<Record<string, string>>;
    writeFile(filepath: string, content: string): Promise<void>;
    removeFile(filepath: string): Promise<void>;
}

// --- Prompts ---
export interface PromptVersion {
    versionId: string;
    content: string;
    createdAt: number;
    author: 'user' | 'ai';
}

export interface Prompt {
    id: string; // The prompt key
    description: string;
    createdAt: number;
    currentVersionId: string;
    versions: PromptVersion[];
}

// --- Wake Word ---
export interface UseWakeWordProps {
  wakeWord: string;
  onWake: () => void;
  enabled: boolean;
  onPermissionError: (message: string) => void;
}

// --- Browser Tool ---
export interface BrowserControls {
  open(url: string): Promise<void>;
  close(): Promise<void>;
  show(): Promise<void>;
  hide(): Promise<void>;
  getPageContent(): Promise<string>;
  interactWithPage(selector: string, action: 'click' | 'type', value?: string): Promise<string>;
  captureBrowserScreenshot(): Promise<string>;
  setContainer(element: HTMLElement | null): void;
}


// --- Tooling ---
export const DELETED_FILE_SENTINEL = '__VFS_DELETED__' as const;

export interface AiVirtualFileSystem {
    originalFiles: Record<string, string>;
    mutations: Record<string, string | typeof DELETED_FILE_SENTINEL>;
}

export interface ToolImplementationsDependencies {
    files: Record<string, string>;
    setFiles: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    activeFile: string | null;
    setActiveFile: (filename: string | null) => void;
    activeView: View;
    setActiveView: (view: View) => void;
    lastActiveView: View;
    aiRef: React.RefObject<any>; // GoogleGenAI
    gitServiceRef: React.RefObject<GitService | null>;
    settings: AppSettings;
    onSettingsChange: (settings: AppSettings) => void;
    bundleLogs: string[];
    previewConsoleLogs: PreviewLogEntry[];
    liveSessionControlsRef: React.RefObject<LiveSessionControls | undefined>;
    browserControlsRef: React.RefObject<BrowserControls | undefined>;
    getActiveThread: () => ChatThread | undefined;
    updateThread: (threadId: string, updates: Partial<ChatThread>) => void;
    setScreenshotPreview: (dataUrl: string | null) => void;
    isScreenshotPreviewDisabled: boolean;
    setIsScreenshotPreviewDisabled: (disabled: boolean) => void;
    onGitPush: () => Promise<void>;
    onGitPull: (rebase: boolean) => Promise<void>;
    onGitRebase: (branch: string) => Promise<void>;
    onDiscardChanges: () => Promise<void>;
    setCommitMessage: (message: string) => void;
    // VFS
    getAiVirtualFiles: () => AiVirtualFileSystem | null;
    setAiVirtualFiles: React.Dispatch<React.SetStateAction<AiVirtualFileSystem | null>>;
    onCommitAiToHead: () => void;
    getVfsReadyPromise: () => Promise<void>;
    saveVfsSession: () => Promise<void>;
    deleteVfsSession: () => Promise<void>;
    // Prompts
    prompts: Prompt[];
    createPrompt: (id: string, description: string, content: string) => Promise<void>;
    updatePrompt: (id: string, content: string, author: 'user' | 'ai') => Promise<void>;
    deletePrompt: (id: string) => Promise<void>;
}

// --- Logging ---
export interface LogEntry {
  timestamp: number;
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
}

// --- Preview ---
export interface PreviewLogEntry {
  id: string;
  type: 'log' | 'warn' | 'error';
  timestamp: number;
  message: string;
}

export interface PreviewState {
  htmlContent: string;
  videoFrameDataUrl: string | null;
  videoFrameRect: DOMRect | null;
}