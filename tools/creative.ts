import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';

// --- Function Declarations ---

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

// --- Aggregated Declarations ---

export const declarations = [
    generateImageFunction,
    generateVideoFunction
];

// --- Implementations Factory ---

export const getImplementations = ({ aiRef }: Pick<ToolImplementationsDependencies, 'aiRef'>) => ({
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
        
        // The API key is required to access the download link.
        const apiKey = process.env.API_KEY;
        if (!apiKey) throw new Error("API_KEY is not configured.");

        return { downloadUrl: `${downloadLink}&key=${apiKey}` };
    },
});
