// Fix: Added missing import for React to use React-specific types.
import React from 'react';
import { AiMessage, ToolCall, UseAiChatProps } from '../../types';
import { Part, FunctionCall } from '@google/genai';

// This interface holds all the state for a single model turn,
// which may involve multiple back-and-forths for tool calls.
export interface TurnState {
  toolCalls: ToolCall[];
  modelMessageId: string | null;
  textContent: string;
}

// Props required for managing the turn's state in the UI
export interface TurnManagerProps extends Pick<UseAiChatProps, 'addMessage' | 'updateMessage'> {
  turnStateRef: React.MutableRefObject<TurnState>;
}

// Props required for executing tool calls
export interface ToolExecutorProps extends Pick<UseAiChatProps, 'toolImplementations' | 'updateMessage'> {
    functionCalls: FunctionCall[];
    turnStateRef: React.MutableRefObject<TurnState>;
}

// Props required for processing the API stream
export interface StreamProcessorProps {
    stream: AsyncIterable<any>; // Stream from sendMessageStream
    onChunk: (text: string | null, functionCalls: FunctionCall[] | null) => void;
}