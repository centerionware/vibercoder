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
      force: {
        type: Type.BOOLEAN,
        description: 'If true, bypasses safety checks like the catastrophic overwrite prevention. Use with extreme caution as this can lead to data loss if your context is stale.',
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

export const patchFileFunction: FunctionDeclaration = {
    name: 'patchFile',
    description: 'Applies a targeted change to an existing file by replacing the first occurrence of a search string with new content. This is safer than `updateFile` for small changes as it avoids the risk of catastrophic overwrites due to context loss.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            filename: {
                type: Type.STRING,
                description: 'The full name of the file to patch.',
            },
            search: {
                type: Type.STRING,
                description: 'The exact string of content to find in the file.',
            },
            replace: {
                type: Type.STRING,
                description: 'The new content that will replace the `search` string.',
            },
        },
        required: ['filename', 'search', 'replace'],
    },
};

// --- Aggregated Declarations ---

export const declarations = [
    listFilesFunction,
    readFileFunction,
    updateFileFunction,
    createFileFunction,
    removeFileFunction,
    patchFileFunction,
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
    updateFile: async (args: { filename: string; content: string; force?: boolean }) => {
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
        
        // Safety Check: Prevent catastrophic overwrites due to context loss.
        if (!args.force) {
            const originalContent = vfs.originalFiles[filename];
            if (originalContent && originalContent.length > 500 && newContent.length < (originalContent.length * 0.25)) {
                throw new Error(`Write operation rejected due to high risk of context loss. The new content (${newContent.length} chars) is drastically smaller than the original file (${originalContent.length} chars). To proceed, you can either: 1. Call this tool again with the 'force: true' parameter. 2. Use the 'patchFile' tool for a more targeted change. 3. Read the file again to refresh your context before updating.`);
            }
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
    },
    patchFile: async (args: { filename: string; search: string; replace: string }) => {
        await getVfsReadyPromise();
        const vfs = getAiVirtualFiles();
        if (vfs === null) {
            throw new Error("No active AI session. Cannot patch file.");
        }
        if (typeof args.filename !== 'string' || !args.filename) {
            throw new Error("patchFile tool call is missing the required 'filename' argument.");
        }
        if (typeof args.search !== 'string') {
             throw new Error("patchFile tool call is missing the required 'search' argument.");
        }
        if (typeof args.replace !== 'string') {
            throw new Error("patchFile tool call is missing the required 'replace' argument.");
        }

        const filename = normalizePath(args.filename);
        
        // Get the current content from the VFS, considering mutations.
        const mutation = vfs.mutations[filename];
        let currentContent: string;
        if (typeof mutation === 'string') {
            currentContent = mutation;
        } else if (mutation === DELETED_FILE_SENTINEL) {
            throw new Error(`Cannot patch file "${filename}" because it has been deleted in this session.`);
        } else if (vfs.originalFiles[filename] !== undefined) {
            currentContent = vfs.originalFiles[filename];
        } else {
            throw new Error(`File "${filename}" not found in the AI virtual session.`);
        }

        if (!currentContent.includes(args.search)) {
            throw new Error(`The search string was not found in the file "${filename}". You may need to read the file again to get the exact content before patching.`);
        }

        const newContent = currentContent.replace(args.search, args.replace);

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

        return { success: true, message: `File "${filename}" patched successfully.` };
    },
});