// Fix: Added Dispatch and SetStateAction to imports to resolve type errors.
import { useState, useCallback, Dispatch, SetStateAction } from 'react';

const initialFiles: Record<string, string> = {
    'index.html': `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>VibeCode App</title>
    <link rel="stylesheet" href="style.css">
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

// Fix: Use imported Dispatch and SetStateAction types directly.
export const useFiles = () => {
    const [files, setFiles] = useState<Record<string, string>>(initialFiles);
    const [activeFile, setActiveFile] = useState<string | null>('index.tsx');

    const handleWriteFile = useCallback((filename: string, content: string) => {
        setFiles(prevFiles => ({
            ...prevFiles,
            [filename]: content,
        }));
    }, []);

    const handleRemoveFile = useCallback((filename: string) => {
      setFiles(prevFiles => {
        const newFiles = { ...prevFiles };
        delete newFiles[filename];
        return newFiles;
      });
      if (activeFile === filename) {
        setActiveFile(null);
      }
    }, [activeFile]);
    
    return {
        files,
        setFiles, // Expose setFiles to allow workspace replacement
        activeFile,
        setActiveFile,
        onWriteFile: handleWriteFile,
        onRemoveFile: handleRemoveFile,
    };
};