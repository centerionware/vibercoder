
import React, { useRef, useState } from 'react';
import Editor, { Monaco, OnMount } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import FilePlusIcon from '../icons/FilePlusIcon';
import FolderPlusIcon from '../icons/FolderPlusIcon';
import CompressIcon from '../icons/CompressIcon';
import ExpandIcon from '../icons/ExpandIcon';
import ChevronLeftIcon from '../icons/ChevronLeftIcon';
import FilesIcon from '../icons/FilesIcon';

interface FileTreeProps {
    files: Record<string, string>;
    activeFile: string | null;
    onSelect: (filename: string) => void;
    onAddFile: () => void;
    onAddFolder: () => void;
    onCollapse: () => void;
}

const FileTree: React.FC<FileTreeProps> = ({ files, activeFile, onSelect, onAddFile, onAddFolder, onCollapse }) => {
  return (
    <div className="w-64 bg-vibe-panel p-2 flex flex-col flex-shrink-0 transition-all duration-300">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-vibe-text-secondary uppercase tracking-wider">EXPLORER</h3>
        <div className="flex items-center gap-1">
          <button onClick={onAddFile} className="p-1 hover:bg-vibe-bg-deep rounded" title="New File"><FilePlusIcon className="w-4 h-4"/></button>
          <button onClick={onAddFolder} className="p-1 hover:bg-vibe-bg-deep rounded" title="New Folder"><FolderPlusIcon className="w-4 h-4"/></button>
          <button onClick={onCollapse} className="p-1 hover:bg-vibe-bg-deep rounded" title="Collapse Explorer"><ChevronLeftIcon className="w-4 h-4"/></button>
        </div>
      </div>
      <ul className="flex-1 overflow-y-auto">
        {Object.keys(files).sort().map(file => (
          <li key={file}>
            <button
              onClick={() => onSelect(file)}
              className={`w-full text-left text-sm px-2 py-1 rounded truncate ${activeFile === file ? 'bg-vibe-accent text-white' : 'hover:bg-vibe-bg-deep text-vibe-text-secondary'}`}
            >
              {file}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
};

interface CollapsedExplorerProps {
    onExpand: () => void;
}

const CollapsedExplorer: React.FC<CollapsedExplorerProps> = ({ onExpand }) => {
    return (
        <div className="w-12 bg-vibe-bg-deep p-2 flex flex-col items-center flex-shrink-0 border-r border-vibe-panel">
            <button onClick={onExpand} className="p-2 hover:bg-vibe-panel rounded" title="Open Explorer">
                <FilesIcon className="w-6 h-6 text-vibe-text-secondary"/>
            </button>
        </div>
    )
}

interface CodeViewProps {
  files: Record<string, string>;
  activeFile: string | null;
  onFileChange: (filename: string, content: string) => void;
  onFileSelect: (filename: string | null) => void;
  onFileAdd: (filename: string) => void;
  onFileRemove: (filename: string) => void;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
}

const CodeView: React.FC<CodeViewProps> = ({ files, activeFile, onFileChange, onFileSelect, onFileAdd, onFileRemove, isFullScreen, onToggleFullScreen }) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('vibe-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: {
        'editor.background': '#1a1b26',
      },
    });
    monaco.editor.setTheme('vibe-dark');

    // Automatically collapse the explorer when the editor becomes active.
    editor.onDidFocusEditorWidget(() => {
      setIsExplorerCollapsed(true);
    });
  };
  
  const handleAddFile = () => {
    const filename = prompt('Enter new file name:');
    if (filename) {
        onFileAdd(filename);
        onFileSelect(filename);
    }
  };

  const handleAddFolder = () => {
      alert('Adding folders is not yet implemented.');
  };

  const fileContent = activeFile ? files[activeFile] : null;

  return (
    <div className="flex flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden">
      {isExplorerCollapsed ? (
        <CollapsedExplorer onExpand={() => setIsExplorerCollapsed(false)} />
      ) : (
        <FileTree
          files={files}
          activeFile={activeFile}
          onSelect={onFileSelect}
          onAddFile={handleAddFile}
          onAddFolder={handleAddFolder}
          onCollapse={() => setIsExplorerCollapsed(true)}
        />
      )}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-shrink-0 bg-vibe-panel p-1 flex justify-between items-center border-b border-vibe-bg">
          <span className="text-sm text-vibe-text-secondary px-2">{activeFile || 'No file selected'}</span>
          <button onClick={onToggleFullScreen} className="p-1 hover:bg-vibe-bg-deep rounded" title={isFullScreen ? 'Exit Full Screen' : 'Enter Full Screen'}>
            {isFullScreen ? <CompressIcon className="w-4 h-4"/> : <ExpandIcon className="w-4 h-4"/>}
          </button>
        </div>
        {activeFile && fileContent !== undefined ? (
          <div className="flex-1 relative">
            <Editor
              key={activeFile}
              height="100%"
              path={activeFile}
              defaultValue={fileContent}
              onChange={(value) => onFileChange(activeFile, value || '')}
              onMount={handleEditorDidMount}
              options={{ minimap: { enabled: false }, automaticLayout: true }}
            />
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center text-vibe-comment">
            Select a file to start coding.
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeView;
