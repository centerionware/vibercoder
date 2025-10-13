import React, { useState, useEffect, useCallback } from 'react';
import SpinnerIcon from '../icons/SpinnerIcon';
import { GitStatus, GitFileStatus, GitService, GitCommit, GitFileChange, DiffLine } from '../../types';
import GitIcon from '../icons/GitIcon';
import CodeIcon from '../icons/CodeIcon';

interface GitViewProps {
  changedFiles: GitStatus[];
  onCommit: (message: string) => Promise<void>;
  isCommitting: boolean;
  gitService: GitService | null;
  onShowFileHistory: (file: { filename: string; content: string }) => void;
}

const DiffViewer: React.FC<{ file: GitFileChange, onShowFileHistory: () => void }> = ({ file, onShowFileHistory }) => (
  <div className="h-full flex flex-col">
    <div className="flex justify-between items-center p-2 border-b border-vibe-bg-deep">
        <h4 className="font-semibold text-vibe-text">{file.filepath}</h4>
        <button 
            onClick={onShowFileHistory}
            className="flex items-center gap-2 text-xs bg-vibe-bg-deep text-vibe-text-secondary px-2 py-1 rounded-md hover:bg-vibe-comment transition-colors"
        >
            <CodeIcon className="w-4 h-4"/>
            View File in Editor
        </button>
    </div>
    <pre className="p-2 font-mono text-xs whitespace-pre-wrap overflow-auto flex-1">
      {file.diff?.map((line, i) => {
        let color = 'text-vibe-comment';
        let prefix = '  ';
        if (line.type === 'add') {
          color = 'text-green-400';
          prefix = '+ ';
        } else if (line.type === 'del') {
          color = 'text-red-400';
          prefix = '- ';
        }
        return <div key={i} className={color}><span className="select-none">{prefix}</span>{line.content}</div>;
      })}
    </pre>
  </div>
);

const GitView: React.FC<GitViewProps> = ({ changedFiles, onCommit, isCommitting, gitService, onShowFileHistory }) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [commitChanges, setCommitChanges] = useState<GitFileChange[]>([]);
  const [selectedFile, setSelectedFile] = useState<GitFileChange | null>(null);

  const loadHistory = useCallback(async (branch?: string) => {
    if (!gitService) return;
    setIsLoading(true);
    try {
      const allBranches = await gitService.listBranches();
      setBranches(allBranches);
      const currentBranch = branch || allBranches.find(b => b === 'main' || b === 'master') || allBranches[0];
      if (currentBranch) {
        setActiveBranch(currentBranch);
        const log = await gitService.log(currentBranch);
        setCommits(log);
      }
    } catch (e) {
      console.error("Failed to load git history:", e);
    } finally {
      setIsLoading(false);
    }
  }, [gitService]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    await onCommit(commitMessage.trim());
    setCommitMessage('');
    await loadHistory(activeBranch || undefined); // Refresh log after commit
  };

  const handleSelectCommit = async (commit: GitCommit) => {
    if (!gitService) return;
    setSelectedCommit(commit);
    setSelectedFile(null); // Reset file selection
    try {
      const changes = await gitService.getCommitChanges(commit.oid);
      setCommitChanges(changes);
    } catch (e) {
      console.error("Failed to get commit changes:", e);
    }
  };
  
  const handleShowFileInEditor = async () => {
    if (!selectedFile || !selectedCommit || !gitService) return;
    const content = await gitService.readFileAtCommit(selectedCommit.oid, selectedFile.filepath);
    if (content !== null) {
      onShowFileHistory({ filename: selectedFile.filepath, content });
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden p-4 space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-vibe-text">Git History</h2>
        {isLoading && <SpinnerIcon className="w-5 h-5" />}
      </div>
      
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Left Panel: Branches & Commits */}
        <div className="w-1/3 flex flex-col gap-4">
            <div className="bg-vibe-panel p-2 rounded-lg">
                <label htmlFor="branch-select" className="text-sm font-semibold text-vibe-text-secondary block mb-1">Branch</label>
                <select id="branch-select" value={activeBranch || ''} onChange={e => loadHistory(e.target.value)} className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent">
                    {branches.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
            </div>
            <div className="bg-vibe-panel p-2 rounded-lg flex-1 overflow-y-auto">
                <h3 className="text-lg font-semibold mb-2 text-vibe-text-secondary">Commits</h3>
                <ul className="space-y-2">
                    {commits.map(commit => (
                        <li key={commit.oid}>
                            <button onClick={() => handleSelectCommit(commit)} className={`w-full text-left p-2 rounded transition-colors ${selectedCommit?.oid === commit.oid ? 'bg-vibe-accent text-white' : 'hover:bg-vibe-bg-deep'}`}>
                                <p className="font-semibold truncate">{commit.message.split('\n')[0]}</p>
                                <p className="text-xs opacity-70">{commit.author.name} - {new Date(commit.author.timestamp * 1000).toLocaleDateString()}</p>
                                <p className="font-mono text-xs opacity-50">{commit.oid.substring(0, 7)}</p>
                            </button>
                        </li>
                    ))}
                </ul>
            </div>
        </div>

        {/* Right Panel: Changes & Diffs */}
        <div className="w-2/3 bg-vibe-panel p-2 rounded-lg flex flex-col overflow-hidden">
            {selectedCommit ? (
                <>
                    <div className="flex-shrink-0 p-2 border-b border-vibe-bg-deep mb-2">
                        <p className="font-semibold text-vibe-text truncate" title={selectedCommit.message}>{selectedCommit.message}</p>
                        <p className="text-xs text-vibe-text-secondary">{selectedCommit.author.name} committed on {new Date(selectedCommit.author.timestamp * 1000).toLocaleDateString()}</p>
                        <p className="font-mono text-xs text-vibe-comment">{selectedCommit.oid}</p>
                    </div>
                    <div className="flex flex-1 gap-2 overflow-hidden">
                        <div className="w-1/3 border-r border-vibe-bg-deep pr-2 overflow-y-auto">
                            <h3 className="text-sm font-semibold mb-2 text-vibe-text-secondary sticky top-0 bg-vibe-panel py-1">Files Changed ({commitChanges.length})</h3>
                            <ul className="space-y-1">
                                {commitChanges.map(change => (
                                    <li key={change.filepath}>
                                        <button onClick={() => setSelectedFile(change)} className={`w-full text-left p-1.5 rounded text-sm ${selectedFile?.filepath === change.filepath ? 'bg-vibe-accent text-white' : 'hover:bg-vibe-bg-deep'}`}>
                                            {change.filepath}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div className="w-2/3">
                            {selectedFile ? <DiffViewer file={selectedFile} onShowFileHistory={handleShowFileInEditor}/> : <div className="flex h-full items-center justify-center text-vibe-comment">Select a file to see the diff.</div>}
                        </div>
                    </div>
                </>
            ) : <div className="flex h-full items-center justify-center text-vibe-comment">Select a commit to see changes.</div>}
        </div>
      </div>

      <div className="bg-vibe-panel p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-2 text-vibe-text-secondary">Commit Staged Changes</h3>
        <p className="text-xs text-vibe-comment mb-2">Files changed in the editor appear here. Only these changes will be committed.</p>
        <div className="mb-2 p-2 bg-vibe-bg rounded-md max-h-24 overflow-y-auto">
            {changedFiles.length > 0 ? (
                <ul className="text-vibe-text font-mono text-xs">
                    {changedFiles.map(file => (
                    <li key={file.filepath}>
                        <span className="font-bold text-yellow-400">MOD</span> {file.filepath}
                    </li>
                    ))}
                </ul>
            ) : (
                <p className="text-vibe-comment text-xs">No changes staged for commit.</p>
            )}
        </div>
        <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Enter commit message..." rows={2} className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent" disabled={changedFiles.length === 0 || isCommitting} />
        <button onClick={handleCommit} disabled={changedFiles.length === 0 || !commitMessage.trim() || isCommitting} className="w-full mt-2 bg-vibe-accent text-white py-2 rounded-md hover:bg-vibe-accent-hover transition-colors disabled:bg-vibe-comment disabled:cursor-not-allowed flex items-center justify-center">
          {isCommitting ? <SpinnerIcon className="w-5 h-5 mr-2" /> : <GitIcon className="w-5 h-5 mr-2" />}
          {isCommitting ? 'Committing...' : `Commit ${changedFiles.length} File(s)`}
        </button>
      </div>
    </div>
  );
};

export default GitView;