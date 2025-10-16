import React, { useState, useEffect, useCallback, useRef } from 'react';
import ReactDOM from 'react-dom';
import SpinnerIcon from '../icons/SpinnerIcon';
import { GitStatus, GitFileStatus, GitService, GitCommit, GitFileChange, DiffLine } from '../../types';
import GitIcon from '../icons/GitIcon';
import CodeIcon from '../icons/CodeIcon';
import { performDiff } from '../../utils/diff';
import ArrowUpIcon from '../icons/ArrowUpIcon';
import ArrowDownIcon from '../icons/ArrowDownIcon';
import ChevronDownIcon from '../icons/ChevronDownIcon';
import RotateCcwIcon from '../icons/RotateCcwIcon';

interface GitViewProps {
  files: Record<string, string>;
  changedFiles: GitStatus[];
  onCommit: (message: string) => Promise<void>;
  onCommitAndPush: (message: string) => Promise<void>;
  isCommitting: boolean;
  gitService: GitService | null;
  onBranchSwitch: (branchName: string) => Promise<void>;
  onOpenFileInEditor: (filepath: string) => void;
  onPush: () => Promise<void>;
  onPull: (rebase: boolean) => Promise<void>;
  onRebase: (branch: string) => Promise<void>;
  isGitNetworkActivity: boolean;
  gitNetworkProgress: string | null;
  onDiscardChanges: () => Promise<void>;
  commitMessage: string;
  onCommitMessageChange: (message: string) => void;
}

const statusColors: Record<GitFileStatus, { text: string; bg: string; label: string }> = {
    [GitFileStatus.New]: { text: 'text-green-400', bg: 'bg-green-500/10', label: 'NEW' },
    [GitFileStatus.Modified]: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'MOD' },
    [GitFileStatus.Deleted]: { text: 'text-red-400', bg: 'bg-red-500/10', label: 'DEL' },
    [GitFileStatus.Unmodified]: { text: 'text-vibe-comment', bg: 'bg-vibe-bg', label: 'UNCH' },
};

const commitStatusColors: Record<GitFileChange['status'], { text: string; bg: string; label: string }> = {
    added: { text: 'text-green-400', bg: 'bg-green-500/10', label: 'ADD' },
    modified: { text: 'text-yellow-400', bg: 'bg-yellow-500/10', label: 'MOD' },
    deleted: { text: 'text-red-400', bg: 'bg-red-500/10', label: 'DEL' },
};

const DiffViewer: React.FC<{
  file: GitStatus | GitFileChange | null;
  diff: DiffLine[] | null;
  isLoading: boolean;
  onOpenFileInEditor: (filepath: string) => void;
}> = ({ file, diff, isLoading, onOpenFileInEditor }) => {
    if (!file) {
        return <div className="flex h-full items-center justify-center text-vibe-comment text-sm">Select a file to see the changes.</div>;
    }
    if (isLoading) {
        return <div className="flex h-full items-center justify-center text-vibe-comment"><SpinnerIcon className="w-6 h-6"/></div>
    }

    const isCommitFile = 'isBinary' in file;
    const canOpenFile = !isCommitFile || (isCommitFile && file.status !== 'deleted');

    return (
        <div className="h-full flex flex-col bg-vibe-bg-deep">
            <div className="flex justify-between items-center p-2 border-b border-vibe-panel flex-shrink-0">
                <h4 className="font-semibold text-vibe-text truncate" title={file.filepath}>{file.filepath}</h4>
                {canOpenFile && (
                    <button onClick={() => onOpenFileInEditor(file.filepath)} className="flex items-center gap-2 text-xs bg-vibe-panel text-vibe-text-secondary px-2 py-1 rounded-md hover:bg-vibe-comment transition-colors">
                        <CodeIcon className="w-4 h-4"/>
                        View in Editor
                    </button>
                )}
            </div>
            <div className="p-2 font-mono text-xs whitespace-pre-wrap overflow-auto flex-1">
                {(file as GitFileChange).isBinary ? (
                    <div className="text-vibe-comment p-4">Binary file contents cannot be displayed.</div>
                ) : (file as GitFileChange).isTooLarge ? (
                    <div className="text-vibe-comment p-4">File diff is too large to display.</div>
                ) : diff ? (
                    diff.map((line, i) => {
                        let color = 'text-vibe-comment'; let prefix = '  ';
                        if (line.type === 'add') { color = 'text-green-400'; prefix = '+ '; }
                        else if (line.type === 'del') { color = 'text-red-400'; prefix = '- '; }
                        return <div key={i} className={`flex ${color}`}>
                                    <span className="select-none w-5 text-right opacity-50">{i+1}</span>
                                    <span className="select-none w-5 text-center">{prefix}</span>
                                    <span>{line.content}</span>
                               </div>;
                    })
                ) : <div className="text-vibe-comment p-4">No changes to display.</div>}
            </div>
        </div>
    );
};


const GitView: React.FC<GitViewProps> = (props) => {
  const { 
    files, changedFiles, onCommit, onCommitAndPush, isCommitting, gitService, onBranchSwitch, 
    onOpenFileInEditor, onPush, onPull, onRebase, isGitNetworkActivity, gitNetworkProgress, onDiscardChanges,
    commitMessage, onCommitMessageChange
  } = props;
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [commitChanges, setCommitChanges] = useState<GitFileChange[]>([]);
  
  const [activeDiffFile, setActiveDiffFile] = useState<GitStatus | GitFileChange | null>(null);
  const [activeDiff, setActiveDiff] = useState<DiffLine[] | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);
  
  const [isCommitMenuOpen, setIsCommitMenuOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});
  const commitButtonRef = useRef<HTMLDivElement>(null);
  
  const isBusy = isCommitting || isGitNetworkActivity;
  const baseButtonClass = "flex-1 flex items-center justify-center gap-2 text-sm bg-vibe-bg text-vibe-text-secondary px-3 py-2 rounded-md hover:bg-vibe-comment transition-colors disabled:opacity-50 disabled:cursor-wait";

  const loadHistory = useCallback(async (branch?: string) => {
    if (!gitService) return;
    setIsLoading(true);
    try {
      const allBranches = await gitService.listBranches();
      setBranches(allBranches);
      const currentBranch = branch || allBranches.find(b => b.startsWith('main') || b.startsWith('master')) || allBranches[0];
      if (currentBranch) {
        setActiveBranch(currentBranch);
        const log = await gitService.log(currentBranch);
        setCommits(log);
      }
    } catch (e) { console.error("Failed to load git history:", e); } 
    finally { setIsLoading(false); }
  }, [gitService]);

  useEffect(() => { loadHistory(); }, [loadHistory]);
  
  // Effect to handle closing the commit menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (isCommitMenuOpen && commitButtonRef.current && !commitButtonRef.current.contains(event.target as Node)) {
        setIsCommitMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isCommitMenuOpen]);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    await onCommit(commitMessage.trim());
    setActiveDiffFile(null);
    setActiveDiff(null);
    await loadHistory(activeBranch || undefined);
  };

  const handleCommitAndPush = async () => {
    if (!commitMessage.trim()) return;
    setIsCommitMenuOpen(false); // Close menu first
    await onCommitAndPush(commitMessage.trim());
    setActiveDiffFile(null);
    setActiveDiff(null);
    await loadHistory(activeBranch || undefined);
  };

  const toggleCommitMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (commitButtonRef.current) {
        const rect = commitButtonRef.current.getBoundingClientRect();
        const menuHeight = 44; // Height of one button with padding
        
        // FIX: The `top` property was being added after object creation, causing a TypeScript error.
        // This was fixed by calculating the `top` position first and including it directly in the style object's definition.
        const topPosition = rect.top > menuHeight + 8
            ? `${rect.top - menuHeight - 4}px`
            : `${rect.bottom + 4}px`;

        const style: React.CSSProperties = {
            width: `${rect.width}px`,
            left: `${rect.left}px`,
            top: topPosition,
            zIndex: 50,
        };

        setMenuStyle(style);
    }
    setIsCommitMenuOpen(prev => !prev);
  };

  const handleSelectBranch = async (branchName: string) => {
    if (!branchName || isLoading || branchName === activeBranch) return;
    setIsLoading(true);
    try {
        await onBranchSwitch(branchName);
        setSelectedCommit(null);
        setActiveDiffFile(null);
        setActiveDiff(null);
        await loadHistory(branchName);
    } catch (e) { console.error("Error handling branch switch:", e); } 
    finally { setIsLoading(false); }
  };

  const handleSelectCommit = async (commit: GitCommit) => {
    if (!gitService || selectedCommit?.oid === commit.oid) return;
    setSelectedCommit(commit);
    setActiveDiffFile(null);
    setActiveDiff(null);
    setIsDiffLoading(true);
    try {
      const changes = await gitService.getCommitChanges(commit.oid);
      setCommitChanges(changes);
    } catch (e) { console.error("Failed to get commit changes:", e); }
    finally { setIsDiffLoading(false); }
  };

  const handleSelectWorkspaceFile = async (file: GitStatus) => {
    if (!gitService) return;
    setActiveDiffFile(file);
    setIsDiffLoading(true);
    try {
        const workspaceContent = files[file.filepath];
        const headContent = file.status === GitFileStatus.New ? '' : await gitService.readFileAtCommit('HEAD', file.filepath) || '';
        const diff = performDiff(headContent, workspaceContent ?? '');
        setActiveDiff(diff);
    } catch (e) {
        console.error("Failed to get workspace diff", e);
        setActiveDiff(null);
    } finally {
        setIsDiffLoading(false);
    }
  };
  
  const handleSelectCommitFile = async (file: GitFileChange) => {
    if (!gitService || !selectedCommit) return;
      setActiveDiffFile(file);
      if (file.diff) {
          setActiveDiff(file.diff);
      }
      setIsDiffLoading(true);
      try {
          const parentOid = selectedCommit.parent[0];
          const contentAfter = await gitService.readFileAtCommit(selectedCommit.oid, file.filepath);
          let contentBefore = '';
          if (parentOid && file.status !== 'added') {
              contentBefore = await gitService.readFileAtCommit(parentOid, file.filepath) || '';
          }
          const diff = performDiff(contentBefore, contentAfter || '');
          setActiveDiff(diff);
      } catch (e) {
          console.error("Failed to generate commit diff", e);
          setActiveDiff(null);
      } finally {
          setIsDiffLoading(false);
      }
  };
  
  const handlePull = async (rebase: boolean) => {
      await onPull(rebase);
      await loadHistory(activeBranch || undefined);
  };

  const handleRebase = async () => {
    const upstreamBranch = branches.find(b => b.startsWith('origin/')) || branches.find(b => b !== activeBranch && !b.startsWith('HEAD')) || 'main';
    const targetBranch = prompt("Enter the branch to rebase onto:", upstreamBranch);
    if (targetBranch) {
        await onRebase(targetBranch);
        await loadHistory(activeBranch || undefined);
    }
  };

  const handleDiscard = () => {
    if (window.confirm("Are you sure you want to discard all uncommitted changes in your workspace? This action cannot be undone.")) {
        onDiscardChanges();
    }
  };


  const displayedChanges = selectedCommit ? commitChanges : changedFiles;

  return (
    <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden p-4 gap-4">
      <div className="flex-1 flex gap-4 overflow-hidden">
        <div className="w-1/2 bg-vibe-panel rounded-lg p-2 flex flex-col">
          <div className="flex-shrink-0 mb-2">
            <label htmlFor="branch-select" className="text-sm font-semibold text-vibe-text-secondary block mb-1">Branch</label>
            <select id="branch-select" value={activeBranch || ''} onChange={e => handleSelectBranch(e.target.value)} disabled={isLoading || isBusy} className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent disabled:opacity-50">
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>
          <div className="flex-shrink-0 mb-2 p-2 bg-vibe-bg-deep rounded-md">
            <div className="flex gap-2">
                <button onClick={onPush} disabled={isBusy} className={baseButtonClass}>
                    {isGitNetworkActivity ? <SpinnerIcon className="w-4 h-4" /> : <ArrowUpIcon className="w-4 h-4"/>} Push
                </button>
                <button onClick={() => handlePull(false)} disabled={isBusy} className={baseButtonClass}>
                    {isGitNetworkActivity ? <SpinnerIcon className="w-4 h-4" /> : <ArrowDownIcon className="w-4 h-4"/>} Pull
                </button>
            </div>
            <div className="flex gap-2 mt-2">
                <button onClick={() => handlePull(true)} disabled={isBusy} className={`${baseButtonClass} text-xs`}>Pull with Rebase</button>
                <button onClick={handleRebase} disabled={isBusy} className={`${baseButtonClass} text-xs`}>Rebase...</button>
            </div>
            <div className="border-t border-vibe-panel my-2"></div>
            <div className="flex gap-2">
                <button 
                    onClick={handleDiscard} 
                    disabled={isBusy || changedFiles.length === 0} 
                    className={`${baseButtonClass} text-yellow-400 hover:bg-yellow-500/10 border border-yellow-500/20`}
                >
                    <RotateCcwIcon className="w-4 h-4"/> Discard Changes
                </button>
            </div>
             {isGitNetworkActivity && gitNetworkProgress && (
                <div className="text-xs text-vibe-comment mt-2 text-center animate-pulse">{gitNetworkProgress}</div>
            )}
          </div>
          <h3 className="text-lg font-semibold mb-2 text-vibe-text-secondary flex-shrink-0">History</h3>
          <ul className="overflow-y-auto space-y-2 flex-1">
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
        <div className="w-1/2 bg-vibe-panel rounded-lg overflow-hidden">
          <DiffViewer file={activeDiffFile} diff={activeDiff} isLoading={isDiffLoading} onOpenFileInEditor={onOpenFileInEditor} />
        </div>
      </div>

      <div className="flex-shrink-0 h-2/5 bg-vibe-panel rounded-lg p-2 flex gap-4 overflow-hidden">
        <div className="w-1/2 flex flex-col">
          <header className="flex-shrink-0 mb-2">
             {selectedCommit ? (
                <>
                    <button onClick={() => setSelectedCommit(null)} className="text-xs text-vibe-accent hover:underline mb-1">← View Workspace Changes</button>
                    <p className="font-semibold text-vibe-text truncate" title={selectedCommit.message}>{selectedCommit.message}</p>
                </>
            ) : <h3 className="text-lg font-semibold text-vibe-text-secondary">Workspace Changes</h3> }
          </header>
          <ul className="space-y-1 overflow-y-auto flex-1">
            {displayedChanges.length > 0 ? displayedChanges.map((file, i) => {
              const isCommitChange = 'diff' in file;
              const status = isCommitChange ? file.status : file.status;
              const colors = isCommitChange ? commitStatusColors[file.status] : statusColors[file.status];

              return (
                <li key={file.filepath + i}>
                  <button onClick={() => isCommitChange ? handleSelectCommitFile(file) : handleSelectWorkspaceFile(file)} className={`w-full flex items-center gap-2 text-left p-1.5 rounded text-sm ${activeDiffFile?.filepath === file.filepath ? 'bg-vibe-accent text-white' : 'hover:bg-vibe-bg-deep'}`}>
                    <span className={`font-mono font-bold text-xs w-8 text-center py-0.5 rounded-sm ${colors.bg} ${colors.text}`}>{colors.label}</span>
                    <span className="truncate">{file.filepath}</span>
                  </button>
                </li>
              )
            }) : <p className="text-vibe-comment text-xs p-2">No changes to display.</p>}
          </ul>
        </div>
        <div className="w-1/2 flex flex-col">
          <textarea value={commitMessage} onChange={(e) => onCommitMessageChange(e.target.value)} placeholder="Enter commit message... or ask the AI to generate one!" rows={3} className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text text-sm focus:outline-none focus:ring-2 focus:ring-vibe-accent disabled:opacity-50 flex-1" disabled={!!selectedCommit || changedFiles.length === 0 || isBusy} />
          
          <div ref={commitButtonRef} className="relative mt-2 flex">
            <button
              onClick={handleCommit}
              disabled={!!selectedCommit || changedFiles.length === 0 || !commitMessage.trim() || isBusy}
              className="flex-grow bg-vibe-accent text-white py-2 rounded-l-md hover:bg-vibe-accent-hover transition-colors disabled:bg-vibe-comment disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isCommitting ? <SpinnerIcon className="w-5 h-5 mr-2" /> : <GitIcon className="w-5 h-5 mr-2" />}
              {isCommitting ? 'Committing...' : `Commit ${changedFiles.length} File(s)`}
            </button>
            <button
              onClick={toggleCommitMenu}
              disabled={!!selectedCommit || changedFiles.length === 0 || isBusy}
              className="flex-shrink-0 w-10 bg-vibe-accent hover:bg-vibe-accent-hover rounded-r-md border-l border-white/20 flex items-center justify-center disabled:bg-vibe-comment disabled:cursor-not-allowed"
              aria-haspopup="true"
              aria-expanded={isCommitMenuOpen}
              aria-label="Commit options"
            >
                <ChevronDownIcon className="w-4 h-4 text-white" />
            </button>
          </div>

          {isCommitMenuOpen && ReactDOM.createPortal(
            <div style={menuStyle} className="absolute bg-vibe-bg-deep rounded-md shadow-lg border border-vibe-panel p-1">
                <button
                    onClick={handleCommitAndPush}
                    disabled={!commitMessage.trim() || isBusy}
                    className="w-full text-left px-3 py-2 text-sm rounded-md text-vibe-text-secondary hover:bg-vibe-panel disabled:opacity-50 flex items-center gap-2"
                >
                    Commit & Push
                </button>
            </div>,
            document.body
          )}
        </div>
      </div>
    </div>
  );
};

export default GitView;