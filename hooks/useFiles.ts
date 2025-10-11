import { useState, useCallback, useEffect } from 'react';

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


export const useFiles = (setChangedFiles: React.Dispatch<React.SetStateAction<string[]>>) => {
    const [files, setFiles] = useState<Record<string, string>>(initialFiles);
    const [activeFile, setActiveFile] = useState<string | null>('index.tsx');

    // Mock tracking changed files for Git view
    const trackChange = (filename: string) => {
      setChangedFiles(prev => {
        if (prev.includes(filename)) return prev;
        return [...prev, filename];
      });
    };

    const handleWriteFile = useCallback((filename: string, content: string) => {
        setFiles(prevFiles => ({
            ...prevFiles,
            [filename]: content,
        }));
        trackChange(filename);
    }, [setChangedFiles]);

    const handleRemoveFile = useCallback((filename: string) => {
      setFiles(prevFiles => {
        const newFiles = { ...prevFiles };
        delete newFiles[filename];
        return newFiles;
      });
      if (activeFile === filename) {
        setActiveFile(null);
      }
      // Note: In a real Git system, deleting would also be a "change".
      // For this mock, we'll remove it from the changed list if it exists.
      setChangedFiles(prev => prev.filter(f => f !== filename));
    }, [activeFile, setChangedFiles]);
    
    // Initialize changed files on load (for demo)
    useEffect(() => {
        setChangedFiles(['index.tsx']);
    }, [setChangedFiles])

    return {
        files,
        activeFile,
        setActiveFile,
        onWriteFile: handleWriteFile,
        onRemoveFile: handleRemoveFile,
    };
};
