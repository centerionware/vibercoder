import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, DELETED_FILE_SENTINEL } from '../types';
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
  description: 'Write content to a file, creating it if it doesn\'t exist or overwriting it if it does. IMPORTANT: All file operations occur in a temporary session. You MUST call `commitToHead` at the end of your task to save your changes to the main workspace, otherwise they will be discarded when your turn ends.',
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

export const getImplementations = ({ getAiVirtualFiles, setAiVirtualFiles, getVfsReadyPromise }: Pick<ToolImplementationsDependencies, 'getAiVirtualFiles' | 'setAiVirtualFiles' | 'getVfsReadyPromise'>) => ({
    listFiles: async () => {
        await getVfsReadyPromise();
        const vfs = getAiVirtualFiles();
        if (vfs === null) {
            throw new Error("No active AI session. Cannot list files.");
        }
        
        const fileSet = new Set(Object.keys(vfs.originalFiles));
        for (const [filepath, mutation] of Object.entries(vfs.mutations)) {
            if (typeof mutation === 'string') {
                fileSet.add(filepath);
            } else { // DELETED_FILE_SENTINEL
                fileSet.delete(filepath);
            }
        }
        return { files: Array.from(fileSet).sort() };
    },
    readFile: async (args: { filename: string }) => {
        await getVfsReadyPromise();
        const vfs = getAiVirtualFiles();
        if (vfs === null) {
            throw new Error("No active AI session. Cannot read file.");
        }
        if (typeof args.filename !== 'string' || !args.filename) {
            throw new Error("readFile tool call is missing the required 'filename' argument.");
        }
        const filename = normalizePath(args.filename);
        
        const mutation = vfs.mutations[filename];
        if (mutation) {
            if (typeof mutation === 'string') {
                return { content: mutation };
            } else { // DELETED_FILE_SENTINEL
                throw new Error(`File "${filename}" not found in the AI virtual session (it was deleted).`);
            }
        }

        if (vfs.originalFiles[filename] !== undefined) {
            return { content: vfs.originalFiles[filename] };
        }
        
        throw new Error(`File "${filename}" not found in the AI virtual session.`);
    },
    writeFile: async (args: { filename: string; content: string }) => {
        await getVfsReadyPromise();
        if (getAiVirtualFiles() === null) {
            throw new Error("No active AI session. Cannot write file.");
        }
        if (typeof args.filename !== 'string' || !args.filename) {
            throw new Error("writeFile tool call is missing the required 'filename' argument.");
        }
        if (typeof args.content !== 'string') {
            throw new Error("writeFile tool call is missing the required 'content' argument.");
        }
        const filename = normalizePath(args.filename);
        
        setAiVirtualFiles(prevVfs => {
            if (!prevVfs) return prevVfs; // Should not happen
            return {
                ...prevVfs,
                mutations: {
                    ...prevVfs.mutations,
                    [filename]: args.content,
                }
            };
        });
        
        return { success: true };
    },
    removeFile: async (args: { filename: string }) => {
        await getVfsReadyPromise();
        const vfs = getAiVirtualFiles();
        if (vfs === null) {
            throw new Error("No active AI session. Cannot remove file.");
        }
        if (typeof args.filename !== 'string' || !args.filename) {
            throw new Error("removeFile tool call is missing the required 'filename' argument.");
        }
        const filename = normalizePath(args.filename);

        // Check if file actually exists before allowing deletion
        const mutation = vfs.mutations[filename];
        const existsInOriginal = vfs.originalFiles[filename] !== undefined;

        if (mutation === DELETED_FILE_SENTINEL || (!existsInOriginal && typeof mutation !== 'string')) {
            throw new Error(`File "${filename}" not found in the AI virtual session.`);
        }
        
        setAiVirtualFiles(prevVfs => {
            if (!prevVfs) return prevVfs;
            return {
                ...prevVfs,
                mutations: {
                    ...prevVfs.mutations,
                    [filename]: DELETED_FILE_SENTINEL,
                }
            };
        });

        return { success: true };
    }
});