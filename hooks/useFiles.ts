import { useState, useCallback } from 'react';
import { db } from '../utils/idb';

export const initialFiles: Record<string, string> = {
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VibeCode App</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>`,
    'index.tsx': `import React from 'react';
import ReactDOM from 'react-dom/client';
import './style.css';

const App = () => {
  return (
    <div className="container">
      <h1>Hello, VibeCode!</h1>
      <p>Start editing to see some magic happen.</p>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
`,
    'style.css': `body {
  font-family: sans-serif;
  background-color: #1a1b26;
  color: #c0caf5;
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  margin: 0;
}

.container {
  text-align: center;
}

h1 {
  color: #bb9af7;
}
`,
};

export const useFiles = (activeProjectId: string | null) => {
    const [files, setFiles] = useState<Record<string, string>>({});
    const [activeFile, setActiveFile] = useState<string | null>(null);

    const handleWriteFile = useCallback(async (filename: string, content: string) => {
        setFiles(prevFiles => ({
            ...prevFiles,
            [filename]: content,
        }));
        if (activeProjectId) {
            await db.projectFiles.put({ projectId: activeProjectId, filepath: filename, content });
        }
    }, [activeProjectId]);

    const handleRemoveFile = useCallback(async (filename: string) => {
      setFiles(prevFiles => {
        const newFiles = { ...prevFiles };
        delete newFiles[filename];
        return newFiles;
      });
      if (activeProjectId) {
        const fileToDelete = await db.projectFiles.get({ projectId: activeProjectId, filepath: filename });
        if (fileToDelete?.id) {
            await db.projectFiles.delete(fileToDelete.id);
        }
      }
      if (activeFile === filename) {
        setActiveFile(null);
      }
    }, [activeFile, activeProjectId]);

    const handleSetFiles = useCallback(async (newFiles: Record<string, string> | ((prevState: Record<string, string>) => Record<string, string>)) => {
        const updatedFiles = typeof newFiles === 'function' ? newFiles(files) : newFiles;
        setFiles(updatedFiles);

        if (activeProjectId) {
            // FIX: Cast 'db' to 'any' to call the 'transaction' method, resolving a TypeScript type error with Dexie's dynamic API.
            await (db as any).transaction('rw', db.projectFiles, async () => {
                await db.projectFiles.where({ projectId: activeProjectId }).delete();
                const filesToBulkAdd = Object.entries(updatedFiles).map(([filepath, content]) => ({ projectId: activeProjectId, filepath, content }));
                if (filesToBulkAdd.length > 0) {
                    await db.projectFiles.bulkAdd(filesToBulkAdd);
                }
            });
        }
    }, [activeProjectId, files]);
    
    return {
        files,
        setFiles: handleSetFiles,
        activeFile,
        setActiveFile,
        onWriteFile: handleWriteFile,
        onRemoveFile: handleRemoveFile,
    };
};