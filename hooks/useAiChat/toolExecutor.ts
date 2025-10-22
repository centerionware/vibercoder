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
    thinking: `Preparing tools: ${newToolCallsForUi.map(t => t.name).join(', ')}...`,
  });

  // 2. Execute all tool calls in parallel
  const toolResponsePartsNested = await Promise.all(
    functionCalls.map(async (fc, index) => {
      const uiToolCall = newToolCallsForUi[index];
      const parts: Part[] = [];
      try {
        const toolFn = (toolImplementations as any)[fc.name!];
        if (!toolFn) throw new Error(`Tool "${fc.name}" not found.`);

        turnStateRef.current.thinkingContent += `\n- Preparing to execute tool: \`${fc.name}\`...\n`;
        updateMessage(modelMessageId, { thinkingContent: turnStateRef.current.thinkingContent });

        const result = await toolFn(fc.args);
        
        turnStateRef.current.thinkingContent += `- Tool \`${fc.name}\` finished with status: SUCCESS.\n`;
        updateMessage(modelMessageId, { thinkingContent: turnStateRef.current.thinkingContent });
        
        if (fc.name === 'think' && result.thought) {
            turnStateRef.current.thinkingContent += `> ${result.thought.replace(/\n/g, '\n> ')}\n\n`;
            updateMessage(modelMessageId, { 
                thinkingContent: turnStateRef.current.thinkingContent,
            });
        }
        
        // Handle side-effects for creative tools that add attachments
        if (fc.name === 'generateImage' && result.base64Image) {
            updateMessage(modelMessageId, { attachments: [{ type: 'image', data: result.base64Image }] });
        }
        if (fc.name === 'generateVideo' && result.downloadUrl) {
            updateMessage(modelMessageId, { attachments: [{ type: 'video', data: result.downloadUrl }] });
        }

        // Handle image-based tools, which inject an image into the next prompt
        if (fc.name === 'captureScreenshot' && result.base64Image) {
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: result.base64Image,
                }
            });

            // This structured response gives the model a very strong hint to use the new image.
            const screenshotResponse = {
                status: "Success",
                confirmation: "A screenshot of the user's application has been captured and is included in this turn's context.",
                instruction: "Your next response must be an analysis based *only* on the visual information in this new screenshot."
            };
            
            parts.push({
                functionResponse: {
                    name: fc.name!,
                    response: { result: screenshotResponse },
                }
            });

        } else {
            // Standard tool response for all other tools
            parts.push({ functionResponse: { name: fc.name!, response: { result } } });
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

        turnStateRef.current.thinkingContent += `- Tool \`${fc.name}\` finished with status: ERROR. Reason: ${error}\n`;
        updateMessage(modelMessageId, { thinkingContent: turnStateRef.current.thinkingContent });
        
        // Update UI to show error
        turnStateRef.current.toolCalls = turnStateRef.current.toolCalls.map(tc =>
          tc.id === uiToolCall.id ? { ...tc, status: ToolCallStatus.ERROR, args: { ...tc.args, errors: [error] } } : tc
        );
        updateMessage(modelMessageId, { toolCalls: [...turnStateRef.current.toolCalls] });
        
        // Return the error response as a single-item array
        return [{ functionResponse: { name: fc.name!, response: { result: { error } } } }];
      }
    })
  );
  
  return toolResponsePartsNested.flat();
};