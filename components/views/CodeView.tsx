

import React, { useRef, useState, useMemo, useCallback, useEffect } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { editor } from 'monaco-editor';
import FilePlusIcon from '../icons/FilePlusIcon';
import FolderPlusIcon from '../icons/FolderPlusIcon';
import CompressIcon from '../icons/CompressIcon';
import ExpandIcon from '../icons/ExpandIcon';
import ChevronLeftIcon from '../icons/ChevronLeftIcon';
import FilesIcon from '../icons/FilesIcon';
import ChevronRightIcon from '../icons/ChevronRightIcon';
import ChevronDownIcon from '../icons/ChevronDownIcon';
import FolderIcon from '../icons/FolderIcon';
import FileIcon from '../icons/FileIcon';


// --- File Tree Logic ---

interface TreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: TreeNode[];
}

const buildFileTree = (files: Record<string, string>): TreeNode[] => {
    const fileTreeRoot: TreeNode = { name: 'root', path: '', type: 'folder', children: [] };

    Object.keys(files).sort().forEach(path => {
        let currentNode = fileTreeRoot;
        const pathParts = path.split('/');

        pathParts.forEach((part, index) => {
            const isFile = index === pathParts.length - 1;
            let childNode = currentNode.children!.find(child => child.name === part && child.type === (isFile ? 'file' : 'folder'));

            if (!childNode) {
                const nodePath = pathParts.slice(0, index + 1).join('/');
                childNode = {
                    name: part,
                    path: nodePath,
                    type: isFile ? 'file' : 'folder',
                    children: isFile ? undefined : []
                };
                currentNode.children!.push(childNode);
            }
            currentNode = childNode;
        });
    });
    
    const sortChildren = (node: TreeNode) => {
        if (node.children) {
            node.children.sort((a, b) => {
                if (a.type === 'folder' && b.type === 'file') return -1;
                if (a.type === 'file' && b.type === 'folder') return 1;
                return a.name.localeCompare(b.name);
            });
            node.children.forEach(sortChildren);
        }
    };

    sortChildren(fileTreeRoot);
    return fileTreeRoot.children || [];
}

interface FileTreeEntryProps {
    node: TreeNode;
    level: number;
    activeFile: string | null;
    onSelect: (filename: string) => void;
    expandedFolders: Set<string>;
    onToggleFolder: (path: string) => void;
}

const FileTreeEntry: React.FC<FileTreeEntryProps> = ({ node, level, activeFile, onSelect, expandedFolders, onToggleFolder }) => {
    const isExpanded = expandedFolders.has(node.path);
    const indentStyle = { paddingLeft: `${level * 16}px` };

    if (node.type === 'folder') {
        return (
            <div>
                <button
                    onClick={() => onToggleFolder(node.path)}
                    className="w-full text-left text-sm px-2 py-1 rounded flex items-center gap-1.5 hover:bg-vibe-bg-deep text-vibe-text-secondary"
                    style={indentStyle}
                >
                    {isExpanded ? <ChevronDownIcon className="w-4 h-4 flex-shrink-0" /> : <ChevronRightIcon className="w-4 h-4 flex-shrink-0" />}
                    <FolderIcon className="w-4 h-4 flex-shrink-0 text-vibe-accent" />
                    <span className="truncate">{node.name}</span>
                </button>
                {isExpanded && node.children && (
                    <div>
                        {node.children.map(child => (
                            <FileTreeEntry
                                key={child.path}
                                node={child}
                                level={level + 1}
                                activeFile={activeFile}
                                onSelect={onSelect}
                                expandedFolders={expandedFolders}
                                onToggleFolder={onToggleFolder}
                            />
                        ))}
                    </div>
                )}
            </div>
        );
    }
    
    // File
    return (
        <button
            onClick={() => onSelect(node.path)}
            className={`w-full text-left text-sm px-2 py-1 rounded flex items-center gap-1.5 truncate ${activeFile === node.path ? 'bg-vibe-accent text-white' : 'hover:bg-vibe-bg-deep text-vibe-text-secondary'}`}
            style={indentStyle}
        >
            <FileIcon className="w-4 h-4 flex-shrink-0 ml-4" />
            <span className="truncate">{node.name}</span>
        </button>
    );
};


interface FileTreeProps {
    tree: TreeNode[];
    activeFile: string | null;
    onSelect: (filename: string) => void;
    onAddFile: () => void;
    onAddFolder: () => void;
    onCollapse: () => void;
    expandedFolders: Set<string>;
    onToggleFolder: (path: string) => void;
}

const FileTree: React.FC<FileTreeProps> = (props) => {
  return (
    <div className="w-64 bg-vibe-panel p-2 flex flex-col flex-shrink-0 transition-all duration-300">
      <div className="flex justify-between items-center mb-2">
        <h3 className="text-sm font-semibold text-vibe-text-secondary uppercase tracking-wider">EXPLORER</h3>
        <div className="flex items-center gap-1">
          <button onClick={props.onAddFile} className="p-1 hover:bg-vibe-bg-deep rounded" title="New File"><FilePlusIcon className="w-4 h-4"/></button>
          <button onClick={props.onAddFolder} className="p-1 hover:bg-vibe-bg-deep rounded" title="New Folder"><FolderPlusIcon className="w-4 h-4"/></button>
          <button onClick={props.onCollapse} className="p-1 hover:bg-vibe-bg-deep rounded" title="Collapse Explorer"><ChevronLeftIcon className="w-4 h-4"/></button>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {props.tree.map(node => (
            <FileTreeEntry
                key={node.path}
                node={node}
                level={0}
                activeFile={props.activeFile}
                onSelect={props.onSelect}
                expandedFolders={props.expandedFolders}
                onToggleFolder={props.onToggleFolder}
            />
        ))}
      </div>
    </div>
  );
};

const CollapsedExplorer: React.FC<{ onExpand: () => void }> = ({ onExpand }) => {
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
  onFileChange: (filename: string, content: string) => Promise<void>;
  onFileSelect: (filename: string | null) => void;
  onFileAdd: (filename: string, content: string) => Promise<void>;
  onFileRemove: (filename: string) => Promise<void>;
  isFullScreen: boolean;
  onToggleFullScreen: () => void;
}

const CodeView: React.FC<CodeViewProps> = ({ files, activeFile, onFileChange, onFileSelect, onFileAdd, onFileRemove, isFullScreen, onToggleFullScreen }) => {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const [isExplorerCollapsed, setIsExplorerCollapsed] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  
  const fileTree = useMemo(() => buildFileTree(files), [files]);
  
  // When files change (e.g., loaded from Git), expand the folder of the currently active file.
  useEffect(() => {
    if (activeFile) {
      const parts = activeFile.split('/');
      if (parts.length > 1) {
        const newExpanded = new Set(expandedFolders);
        for (let i = 1; i < parts.length; i++) {
          const folderPath = parts.slice(0, i).join('/');
          newExpanded.add(folderPath);
        }
        setExpandedFolders(newExpanded);
      }
    }
  }, [activeFile, files]); // Re-run if active file or the entire file set changes.

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monaco.editor.defineTheme('vibe-dark', {
      base: 'vs-dark',
      inherit: true,
      rules: [],
      colors: { 'editor.background': '#1a1b26' },
    });
    monaco.editor.setTheme('vibe-dark');
  };
  
  const expandFoldersForPath = useCallback((path: string) => {
      const parts = path.split('/');
      if (parts.length > 1) {
          const newExpanded = new Set(expandedFolders);
          for (let i = 1; i < parts.length; i++) {
              const folderPath = parts.slice(0, i).join('/');
              newExpanded.add(folderPath);
          }
          setExpandedFolders(newExpanded);
      }
  }, [expandedFolders]);

  const handleAddFile = useCallback(() => {
    const filename = prompt('Enter new file name (e.g., src/components/Button.tsx):');
    if (filename) {
        onFileAdd(filename, '');
        onFileSelect(filename);
        expandFoldersForPath(filename);
    }
  }, [onFileAdd, onFileSelect, expandFoldersForPath]);

  const handleAddFolder = useCallback(() => {
      const folderPath = prompt("Enter new folder path (e.g., 'src/components'):");
      if (!folderPath) return;

      const filename = prompt(`Enter name for the first file in '${folderPath}':`);
      if (!filename) return;

      const fullPath = `${folderPath}/${filename}`;
      onFileAdd(fullPath, '');
      onFileSelect(fullPath);
      expandFoldersForPath(fullPath);
  }, [onFileAdd, onFileSelect, expandFoldersForPath]);

  const handleToggleFolder = useCallback((path: string) => {
      setExpandedFolders(prev => {
          const newSet = new Set(prev);
          if (newSet.has(path)) {
              newSet.delete(path);
          } else {
              newSet.add(path);
          }
          return newSet;
      });
  }, []);

  const fileContent = activeFile ? files[activeFile] : undefined;

  return (
    <div className="flex flex-1 h-full bg-vibe-bg-deep overflow-hidden">
      {isExplorerCollapsed ? (
        <CollapsedExplorer onExpand={() => setIsExplorerCollapsed(false)} />
      ) : (
        <FileTree
          tree={fileTree}
          activeFile={activeFile}
          onSelect={onFileSelect}
          onAddFile={handleAddFile}
          onAddFolder={handleAddFolder}
          onCollapse={() => setIsExplorerCollapsed(true)}
          expandedFolders={expandedFolders}
          onToggleFolder={handleToggleFolder}
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
