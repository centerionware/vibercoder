import { v4 as uuidv4 } from 'uuid';
import { Part } from '@google/genai';
import { ToolCall, ToolCallStatus, GeminiFunctionCall } from '../../types';
import { ToolExecutorProps } from './types';

export const executeTools = async ({
  functionCalls,
  turnStateRef,
  toolImplementations,
  updateMessage,
}: ToolExecutorProps): Promise<Part[]> => {
  const { modelMessageId } = turnStateRef.current;
  if (!modelMessageId) return [];

  // 1. Add new tool calls to the UI in an "in-progress" state
  const newToolCallsForUi: ToolCall[] = functionCalls.map(fc => ({
    id: (fc as any).id || uuidv4(), // Use SDK-provided ID if available
    name: fc.name!,
    args: fc.args!,
    status: ToolCallStatus.IN_PROGRESS,
  }));

  turnStateRef.current.toolCalls.push(...newToolCallsForUi);
  updateMessage(modelMessageId, {
    toolCalls: [...turnStateRef.current.toolCalls],
    thinking: 'Executing tools...',
  });

  // 2. Execute all tool calls in parallel
  const toolResponsePartsNested = await Promise.all(
    functionCalls.map(async (fc, index) => {
      const uiToolCall = newToolCallsForUi[index];
      const parts: Part[] = [];
      try {
        const toolFn = (toolImplementations as any)[fc.name!];
        if (!toolFn) throw new Error(`Tool "${fc.name}" not found.`);

        const result = await toolFn(fc.args);
        
        // Handle side-effects for creative tools that add attachments
        if (fc.name === 'generateImage' && result.base64Image) {
            updateMessage(modelMessageId, { attachments: [{ type: 'image', data: result.base64Image }] });
        }
        if (fc.name === 'generateVideo' && result.downloadUrl) {
            updateMessage(modelMessageId, { attachments: [{ type: 'video', data: result.downloadUrl }] });
        }

        // Handle screenshot tool, which injects an image into the next prompt
        if (fc.name === 'captureScreenshot' && result.base64Image) {
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: result.base64Image,
                }
            });
            // Also add a simple success response for the tool call itself
            parts.push({
                functionResponse: { name: fc.name, response: { success: true, message: 'Screenshot captured and provided as context.' } }
            });
        } else {
            // Standard tool response for all other tools
            parts.push({ functionResponse: { name: fc.name!, response: { content: result } } });
        }

        // Update UI to show success
        turnStateRef.current.toolCalls = turnStateRef.current.toolCalls.map(tc =>
          tc.id === uiToolCall.id ? { ...tc, status: ToolCallStatus.SUCCESS } : tc
        );
        updateMessage(modelMessageId, { toolCalls: [...turnStateRef.current.toolCalls] });

        return parts;

      } catch (e) {
        console.error(`Error executing tool ${fc.name!}:`, e);
        const error = e instanceof Error ? e.message : String(e);

        // Update UI to show error
        turnStateRef.current.toolCalls = turnStateRef.current.toolCalls.map(tc =>
          tc.id === uiToolCall.id ? { ...tc, status: ToolCallStatus.ERROR } : tc
        );
        updateMessage(modelMessageId, { toolCalls: [...turnStateRef.current.toolCalls] });
        
        // Return the error response as a single-item array
        return [{ functionResponse: { name: fc.name!, response: { error } } }];
      }
    })
  );
  
  return toolResponsePartsNested.flat();
};