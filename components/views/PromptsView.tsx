import React, { useState, useEffect, useMemo } from 'react';
import Editor, { OnMount } from '@monaco-editor/react';
import { Prompt, PromptVersion } from '../../types';
import PlusIcon from '../icons/PlusIcon';
import HistoryIcon from '../icons/HistoryIcon';

interface PromptsViewProps {
  prompts: Prompt[];
  createPrompt: (id: string, description: string, content: string) => Promise<void>;
  updatePrompt: (id: string, content: string, author: 'user' | 'ai') => Promise<void>;
  revertToVersion: (id: string, versionId: string) => Promise<void>;
}

const PromptsView: React.FC<PromptsViewProps> = (props) => {
  const { prompts, createPrompt, updatePrompt, revertToVersion } = props;
  const [activePromptId, setActivePromptId] = useState<string | null>(null);
  const [editorContent, setEditorContent] = useState('');
  const [isDirty, setIsDirty] = useState(false);

  const sortedPrompts = useMemo(() => [...prompts].sort((a, b) => a.id.localeCompare(b.id)), [prompts]);
  const activePrompt = useMemo(() => prompts.find(p => p.id === activePromptId), [prompts, activePromptId]);
  const activeVersion = useMemo(() => activePrompt?.versions.find(v => v.versionId === activePrompt.currentVersionId), [activePrompt]);

  useEffect(() => {
    if (sortedPrompts.length > 0 && !activePromptId) {
        setActivePromptId(sortedPrompts[0].id);
    }
  }, [sortedPrompts, activePromptId]);

  useEffect(() => {
    if (activeVersion) {
      setEditorContent(activeVersion.content);
      setIsDirty(false);
    } else {
      setEditorContent('');
    }
  }, [activeVersion]);

  const handleEditorChange = (value: string | undefined) => {
    setEditorContent(value || '');
    if (activeVersion) {
        setIsDirty(value !== activeVersion.content);
    }
  };

  const handleSave = async () => {
    if (activePromptId && isDirty) {
        await updatePrompt(activePromptId, editorContent, 'user');
        setIsDirty(false);
    }
  };
  
  const handleRevert = async (versionId: string) => {
    if (activePromptId && window.confirm("Are you sure you want to revert to this version? This will create a new version with the content of the selected one.")) {
        await revertToVersion(activePromptId, versionId);
    }
  };

  const handleNewPrompt = async () => {
    const id = prompt("Enter a unique key for the new prompt (e.g., 'code_review_guidelines'):");
    if (!id || prompts.some(p => p.id === id)) {
        alert("Invalid or duplicate prompt key.");
        return;
    }
    const description = prompt("Enter a brief description for this prompt:");
    if (id && description) {
        await createPrompt(id, description, `// Start writing your new prompt for "${id}" here.`);
        setActivePromptId(id);
    }
  }

  return (
    <div className="flex flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden p-4 gap-4">
      {/* Prompt List */}
      <div className="w-1/3 bg-vibe-panel rounded-lg p-2 flex flex-col">
        <header className="flex justify-between items-center mb-2 flex-shrink-0">
            <h3 className="text-sm font-semibold text-vibe-text-secondary uppercase tracking-wider">PROMPTS</h3>
            <button onClick={handleNewPrompt} className="p-1 hover:bg-vibe-bg-deep rounded" title="New Prompt"><PlusIcon className="w-4 h-4"/></button>
        </header>
        <ul className="overflow-y-auto space-y-1">
            {sortedPrompts.map(prompt => (
                <li key={prompt.id}>
                    <button 
                        onClick={() => setActivePromptId(prompt.id)}
                        className={`w-full text-left p-2 rounded transition-colors ${activePromptId === prompt.id ? 'bg-vibe-accent text-white' : 'hover:bg-vibe-bg-deep'}`}
                    >
                        <p className="font-semibold truncate">{prompt.id}</p>
                        <p className={`text-xs opacity-70 truncate ${activePromptId === prompt.id ? 'text-white/80' : 'text-vibe-comment'}`}>{prompt.description}</p>
                    </button>
                </li>
            ))}
        </ul>
      </div>

      {/* Editor and Version History */}
      <div className="w-2/3 flex flex-col gap-4">
        {activePrompt ? (
            <>
                <div className="flex-1 bg-vibe-panel rounded-lg flex flex-col min-w-0">
                    <header className="flex-shrink-0 bg-vibe-bg p-2 flex justify-between items-center border-b border-vibe-bg-deep">
                        <span className="text-sm text-vibe-text-secondary px-2">{activePrompt.id}</span>
                        <button onClick={handleSave} disabled={!isDirty} className="text-sm bg-vibe-accent text-white px-3 py-1 rounded-md hover:bg-vibe-accent-hover disabled:bg-vibe-comment disabled:cursor-not-allowed">
                            Save
                        </button>
                    </header>
                    <div className="flex-1 relative">
                        <Editor
                            key={activePrompt.id}
                            height="100%"
                            value={editorContent}
                            onChange={handleEditorChange}
                            path={activePrompt.id + '.md'}
                            options={{ minimap: { enabled: false } }}
                            theme="vs-dark"
                        />
                    </div>
                </div>
                <div className="h-1/3 bg-vibe-panel rounded-lg p-2 flex flex-col">
                     <h3 className="text-sm font-semibold text-vibe-text-secondary uppercase tracking-wider mb-2 flex-shrink-0 flex items-center gap-2"><HistoryIcon className="w-4 h-4"/> Version History</h3>
                     <ul className="overflow-y-auto space-y-2">
                        {activePrompt.versions.slice().reverse().map(version => (
                            <li key={version.versionId} className={`p-2 rounded flex items-center justify-between ${version.versionId === activePrompt.currentVersionId ? 'bg-vibe-bg-deep' : ''}`}>
                                <div>
                                    <p className="text-xs font-mono">{new Date(version.createdAt).toLocaleString()}</p>
                                    <p className="text-xs opacity-70">by {version.author}</p>
                                </div>
                                <button
                                    onClick={() => handleRevert(version.versionId)}
                                    disabled={version.versionId === activePrompt.currentVersionId}
                                    className="text-xs bg-vibe-bg px-2 py-1 rounded-md text-vibe-text-secondary hover:bg-vibe-comment disabled:opacity-50"
                                >
                                    Revert
                                </button>
                            </li>
                        ))}
                     </ul>
                </div>
            </>
        ) : (
            <div className="flex-1 flex items-center justify-center text-vibe-comment">
                Select a prompt to view or edit.
            </div>
        )}
      </div>
    </div>
  );
};

export default PromptsView;