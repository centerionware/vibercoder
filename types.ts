import { Part as GeminiPart, FunctionCall as GeminiFunctionCall, FunctionResponse } from '@google/genai';
import { GoogleGenAI } from '@google/genai'; // For aiRef

export type GeminiContent = {
  role: 'user' | 'model';
  parts: GeminiPart[];
};

export { GeminiFunctionCall, FunctionResponse };

export enum View {
  Code = 'code',
  Preview = 'preview',
  Git = 'git',
  Ai = 'ai',
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
  aiEndpoint: string;
  gitRemoteUrl: string;
  gitUserName: string;
  gitUserEmail: string;
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

export interface ChatThread {
  id: string;
  title: string;
  createdAt: number;
  messages: AiMessage[];
  history: GeminiContent[];
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
    changedFiles: string[];
    threads: ChatThread[];
    sandboxErrors: string[];
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
}

// FIX: Added UseWakeWordProps to define props for the useWakeWord hook.
export interface UseWakeWordProps {
    wakeWord: string;
    onWake: () => void;
    enabled: boolean;
    onPermissionError: (message: string) => void;
}
