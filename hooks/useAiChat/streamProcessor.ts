import { FunctionCall, GenerateContentResponse } from '@google/genai';
import { StreamProcessorProps } from './types';

interface StreamResult {
  accumulatedText: string;
  functionCalls: FunctionCall[];
  fullResponse: GenerateContentResponse;
}

/**
 * Processes the stream from the Gemini API, aggregates the content,
 * and provides real-time chunks via a callback.
 */
export const processStream = async ({ stream, onChunk }: StreamProcessorProps): Promise<StreamResult> => {
  let accumulatedText = '';
  // Use a temporary array to gather all function call chunks from the stream.
  let streamedFunctionCalls: FunctionCall[] = [];
  let lastChunk: GenerateContentResponse | null = null;

  for await (const chunk of stream) {
    lastChunk = chunk;
    let textChunk = null;
    let fcChunk = null;

    if (chunk.text) {
      accumulatedText += chunk.text;
      textChunk = chunk.text;
    }
    if (chunk.functionCalls) {
      streamedFunctionCalls.push(...chunk.functionCalls);
      fcChunk = chunk.functionCalls;
    }
    
    // Provide the raw chunks for real-time UI updates
    onChunk(textChunk, fcChunk);
  }

  // Once the stream is finished, filter for complete function calls that have both a name and args.
  // This is crucial because the API streams function calls in parts.
  const completeFunctionCalls = streamedFunctionCalls.filter(fc => fc.name && fc.args);
  
  if (!lastChunk) {
      throw new Error("Stream processing failed: no chunks were received from the API.");
  }

  return {
    accumulatedText,
    functionCalls: completeFunctionCalls,
    fullResponse: lastChunk,
  };
};