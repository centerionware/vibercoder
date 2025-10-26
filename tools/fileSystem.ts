import { FunctionDeclaration, Type } from '@google/genai';
import { ToolImplementationsDependencies, DELETED_FILE_SENTINEL } from '../types';
import { normalizePath } from '../utils/path';

// --- Function Declarations ---

export const listFilesFunction: FunctionDeclaration = {
  name: 'listFiles',
  description: 'List all files in the current workspace directory.',
  parameters: {
    type: Type.OBJECT,
  },
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

export const updateFileFunction: FunctionDeclaration = {
  name: 'updateFile',
  description: 'Updates an existing file with new content. This tool will fail if the file does not exist. IMPORTANT: Before calling this, you MUST use `readFile` on the same file to ensure your context is fresh. All file operations occur in a temporary session. You MUST call `commitToHead` at the end of your task to save your changes.',
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

export const createFileFunction: FunctionDeclaration = {
  name: 'createFile',
  description: "Creates a new file with the specified content. This tool will fail if a file with the same name already exists. Use 'updateFile' to modify existing files.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: 'The full name of the file to create, including the path.',
      },
      content: {
        type: Type.STRING,
        description: 'The initial content for the new file.',
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
    updateFileFunction,
    createFileFunction,
    removeFileFunction,
];

// --- Implementations Factory ---

export const getImplementations = ({ getAiVirtualFiles, setAiVirtualFiles, getVfsReadyPromise, saveVfsSession }: Pick<ToolImplementationsDependencies, 'getAiVirtualFiles' | 'setAiVirtualFiles' | 'getVfsReadyPromise' | 'saveVfsSession'>) => ({
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
    updateFile: async (args: { filename: string; content: string }) => {
        await getVfsReadyPromise();
        const vfs = getAiVirtualFiles();
        if (vfs === null) {
            throw new Error("No active AI session. Cannot update file.");
        }
        if (typeof args.filename !== 'string' || !args.filename) {
            throw new Error("updateFile tool call is missing the required 'filename' argument.");
        }
        if (typeof args.content !== 'string') {
            throw new Error("updateFile tool call is missing the required 'content' argument.");
        }

        const filename = normalizePath(args.filename);
        const newContent = args.content;
        const originalContent = vfs.originalFiles[filename];

        // Safety Check: Prevent catastrophic overwrites due to context loss.
        if (originalContent && originalContent.length > 500 && newContent.length < (originalContent.length * 0.25)) {
            throw new Error(`Write operation rejected due to high risk of context loss. The new content (${newContent.length} chars) is drastically smaller than the original file (${originalContent.length} chars). You MUST read the file again to refresh your context.`);
        }
        
        setAiVirtualFiles(prevVfs => {
            if (!prevVfs) return prevVfs;
            return {
                ...prevVfs,
                mutations: {
                    ...prevVfs.mutations,
                    [filename]: newContent,
                }
            };
        });

        await saveVfsSession();
        
        return { success: true };
    },
    createFile: async (args: { filename: string; content: string }) => {
        await getVfsReadyPromise();
        const vfs = getAiVirtualFiles();
        if (vfs === null) {
            throw new Error("No active AI session. Cannot create file.");
        }
        if (typeof args.filename !== 'string' || !args.filename) {
            throw new Error("createFile tool call is missing the required 'filename' argument.");
        }
        if (typeof args.content !== 'string') {
            throw new Error("createFile tool call is missing the required 'content' argument.");
        }

        const filename = normalizePath(args.filename);
        
        const mutation = vfs.mutations[filename];
        const existsInOriginal = vfs.originalFiles[filename] !== undefined;

        if ((existsInOriginal && mutation !== DELETED_FILE_SENTINEL) || (typeof mutation === 'string')) {
            throw new Error(`File "${filename}" already exists. Use the 'updateFile' tool to modify existing files.`);
        }

        setAiVirtualFiles(prevVfs => {
            if (!prevVfs) return prevVfs;
            return {
                ...prevVfs,
                mutations: {
                    ...prevVfs.mutations,
                    [filename]: args.content,
                }
            };
        });

        await saveVfsSession();
        
        return { success: true, message: `File "${filename}" created successfully.` };
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

        await saveVfsSession();

        return { success: true };
    }
});