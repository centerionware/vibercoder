import React, { useState, useEffect } from 'react';

interface CodeViewProps {
  files: Record<string, string>;
  activeFile: string | null;
  setActiveFile: (filename: string | null) => void;
  onWriteFile: (filename: string, content: string) => void;
}

const CodeView: React.FC<CodeViewProps> = ({ files, activeFile, setActiveFile, onWriteFile }) => {
  const [code, setCode] = useState('');

  useEffect(() => {
    if (activeFile && files[activeFile] !== undefined) {
      setCode(files[activeFile]);
    } else {
      setCode('');
    }
  }, [activeFile, files]);

  const handleCodeChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setCode(e.target.value);
  };
  
  const handleBlur = () => {
    if (activeFile && files[activeFile] !== code) {
      onWriteFile(activeFile, code);
    }
  };

  return (
    <div className="flex flex-1 h-full overflow-hidden bg-vibe-bg rounded-lg">
      {/* File Explorer */}
      <div className="w-48 bg-vibe-bg-deep flex-shrink-0 flex flex-col border-r border-vibe-panel">
        <h2 className="text-sm font-bold p-3 border-b border-vibe-panel text-vibe-text-secondary uppercase tracking-wider">
          Files
        </h2>
        <ul className="flex-1 overflow-y-auto">
          {Object.keys(files).map((filename) => (
            <li key={filename}>
              <button
                onClick={() => setActiveFile(filename)}
                className={`w-full text-left p-2 text-sm truncate transition-colors duration-150 ${
                  activeFile === filename
                    ? 'bg-vibe-accent text-white'
                    : 'text-vibe-text hover:bg-vibe-panel'
                }`}
              >
                {filename}
              </button>
            </li>
          ))}
        </ul>
      </div>

      {/* Code Editor */}
      <div className="flex-1 flex flex-col bg-vibe-panel">
        {activeFile ? (
          <>
            <div className="p-2 border-b border-vibe-bg-deep text-sm text-vibe-text-secondary">
              {activeFile}
            </div>
            <textarea
              value={code}
              onChange={handleCodeChange}
              onBlur={handleBlur}
              spellCheck="false"
              autoCapitalize="off"
              autoComplete="off"
              autoCorrect="off"
              className="flex-1 w-full bg-vibe-bg p-4 font-mono text-sm text-vibe-text resize-none focus:outline-none"
              placeholder={`// Start coding in ${activeFile}...`}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-vibe-comment">
            <p>Select a file to start editing.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeView;
