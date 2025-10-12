import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies } from '../types';
import { normalizePath } from '../utils/path';

// --- Function Declarations ---

export const listFilesFunction: FunctionDeclaration = {
  name: 'listFiles',
  description: 'List all files in the current workspace directory.',
};

export const readFileFunction: FunctionDeclaration = {
  name: 'readFile',
  description: 'Read the contents of a single file.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: 'The full name of the file to read, including the path from the root if in a subdirectory.',
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
        description: 'The full name of the file to write to, including the path from the root if creating in a subdirectory.',
      },
      content: {
        type: Type.STRING,
        description: 'The new content to write to the file.',
      },
    },
    required: ['filename', 'content'],
  },
};

export const removeFileFunction: FunctionDeclaration = {
    name: 'removeFile',
    description: 'Deletes a file from the workspace.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            filename: {
                type: Type.STRING,
                description: 'The full name of the file to delete, including the path from the root if in a subdirectory.',
            },
        },
        required: ['filename'],
    },
};

// --- Aggregated Declarations ---

export const declarations = [
    listFilesFunction,
    readFileFunction,
    writeFileFunction,
    removeFileFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ files, onWriteFile, onRemoveFile }: Pick<ToolImplementationsDependencies, 'files' | 'onWriteFile' | 'onRemoveFile'>) => ({
    listFiles: async () => ({ files: Object.keys(files) }),
    readFile: async (args: { filename: string }) => {
      if (typeof args.filename !== 'string' || !args.filename) {
        throw new Error("readFile tool call is missing the required 'filename' argument.");
      }
      const filename = normalizePath(args.filename);
      if (files[filename] !== undefined) {
        return { content: files[filename] };
      }
      throw new Error(`File "${filename}" not found.`);
    },
    writeFile: async (args: { filename: string; content: string }) => {
      if (typeof args.filename !== 'string' || !args.filename) {
        throw new Error("writeFile tool call is missing the required 'filename' argument.");
      }
      if (typeof args.content !== 'string') {
        throw new Error("writeFile tool call is missing the required 'content' argument.");
      }
      const filename = normalizePath(args.filename);
      onWriteFile(filename, args.content);
      return { success: true };
    },
    removeFile: async (args: { filename: string }) => {
        if (typeof args.filename !== 'string' || !args.filename) {
            throw new Error("removeFile tool call is missing the required 'filename' argument.");
        }
        const filename = normalizePath(args.filename);
        if (files[filename] === undefined) {
            throw new Error(`File "${filename}" not found.`);
        }
        onRemoveFile(filename);
        return { success: true };
    }
});