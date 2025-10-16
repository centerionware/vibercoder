import { v4 as uuidv4 } from 'uuid';
// FIX: Corrected import from 'FunctionCall' to 'GeminiFunctionCall' to match the exported type in types.ts.
import { AiMessage, ToolCall, GeminiFunctionCall } from '../../types';
import { TurnManagerProps, TurnState } from './types';

// Starts a new turn by creating user and model messages in the UI.
export const startTurn = ({
  turnStateRef,
  addMessage,
  userMessage,
  isSystemMessage = false,
}: Pick<TurnManagerProps, 'turnStateRef' | 'addMessage'> & { userMessage: string; isSystemMessage?: boolean }) => {
  // Reset the state for the new turn
  turnStateRef.current = {
    toolCalls: [],
    modelMessageId: uuidv4(),
    textContent: '',
  };

  // Add the user's message to the chat, unless it's a system message
  if (!isSystemMessage) {
    addMessage({ id: uuidv4(), role: 'user', content: userMessage });
  }
  
  // Add a placeholder for the model's response
  addMessage({
    id: turnStateRef.current.modelMessageId!,
    role: 'model',
    content: '',
    thinking: 'Thinking...',
  });
};

// Updates the current model message with new content from the stream.
export const updateTurn = ({
  turnStateRef,
  updateMessage,
  textUpdate,
  functionCallUpdate,
}: TurnManagerProps & { textUpdate: string | null, functionCallUpdate: GeminiFunctionCall[] | null }) => {
  const { modelMessageId, toolCalls } = turnStateRef.current;
  if (!modelMessageId) return;

  if (textUpdate) {
    turnStateRef.current.textContent += textUpdate;
  }
  
  // Note: We don't add streaming function calls to the main toolCalls array here.
  // We wait until the stream is complete to get the full function call objects.
  const hasPendingTools = (functionCallUpdate && functionCallUpdate.length > 0) || toolCalls.some(tc => tc.status === 'in_progress');

  updateMessage(modelMessageId, {
    content: turnStateRef.current.textContent,
    toolCalls: [...toolCalls],
    thinking: hasPendingTools ? "Thinking about tools..." : "Thinking...",
  });
};


// Finalizes the turn by removing the 'thinking' indicator.
export const finalizeTurn = ({ turnStateRef, updateMessage }: TurnManagerProps) => {
  const { modelMessageId, textContent, toolCalls } = turnStateRef.current;
  if (!modelMessageId) return;

  updateMessage(modelMessageId, {
    thinking: null,
    content: textContent,
    toolCalls: [...toolCalls],
  });
};
