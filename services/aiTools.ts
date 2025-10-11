// Fix: Add missing import for React.
import React from 'react';
import { FunctionDeclaration, Type, GoogleGenAI } from '@google/genai';

// Tool Declarations for Gemini
export const listFilesFunction: FunctionDeclaration = {
  name: 'listFiles',
  description: 'List all files in the current workspace directory.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const readFileFunction: FunctionDeclaration = {
  name: 'readFile',
  description: 'Read the contents of a single file.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: 'The full name of the file to read.',
      },
    },
    required: ['filename'],
  },
};

export const writeFileFunction: FunctionDeclaration = {
  name: 'writeFile',
  description: 'Write content to a file, creating it if it doesn\'t exist or overwriting it if it does.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: 'The full name of the file to write to.',
      },
      content: {
        type: Type.STRING,
        description: 'The new content to write to the file.',
      },
    },
    required: ['filename', 'content'],
  },
};

export const generateImageFunction: FunctionDeclaration = {
  name: 'generateImage',
  description: 'Generate an image based on a descriptive text prompt. This tool should only be used when the user explicitly asks for an image.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      prompt: {
        type: Type.STRING,
        description: 'A detailed description of the image to generate.',
      },
    },
    required: ['prompt'],
  },
};

export const generateVideoFunction: FunctionDeclaration = {
    name: 'generateVideo',
    description: 'Generate a short video based on a descriptive text prompt. This is a slow process that can take several minutes. This tool should only be used when the user explicitly asks for a video.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        prompt: {
          type: Type.STRING,
          description: 'A detailed description of the video to generate.',
        },
      },
      required: ['prompt'],
    },
};

export const allTools: FunctionDeclaration[] = [
    listFilesFunction,
    readFileFunction,
    writeFileFunction,
    generateImageFunction,
    generateVideoFunction
];


interface ToolImplementationsDependencies {
    files: Record<string, string>;
    aiRef: React.RefObject<GoogleGenAI | null>;
    onWriteFile: (filename: string, content: string) => void;
}

export const createToolImplementations = ({ files, aiRef, onWriteFile }: ToolImplementationsDependencies) => ({
    listFiles: async () => ({ files: Object.keys(files) }),
    readFile: async (args: { filename: string }) => {
      if (files[args.filename] !== undefined) {
        return { content: files[args.filename] };
      }
      throw new Error(`File "${args.filename}" not found.`);
    },
    writeFile: async (args: { filename: string; content: string }) => {
      onWriteFile(args.filename, args.content);
      return { success: true };
    },
    generateImage: async (args: { prompt: string }) => {
        const ai = aiRef.current;
        if (!ai) throw new Error("AI not initialized.");
        const response = await ai.models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt: args.prompt,
            config: { numberOfImages: 1, outputMimeType: 'image/jpeg' },
        });
        const base64ImageBytes = response.generatedImages[0].image.imageBytes;
        return { base64Image: base64ImageBytes };
    },
    generateVideo: async (args: { prompt: string }) => {
        const ai = aiRef.current;
        if (!ai) throw new Error("AI not initialized.");
        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: args.prompt,
            config: { numberOfVideos: 1 },
        });

        // Simplified polling for demo purposes
        while (!operation.done) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          operation = await ai.operations.getVideosOperation({ operation });
        }
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (!downloadLink) throw new Error("Video generation failed to produce a link.");
        
        return { downloadUrl: `${downloadLink}&key=${process.env.API_KEY}` };
    },
});
