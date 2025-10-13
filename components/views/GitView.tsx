import React, { useState, useEffect, useCallback } from 'react';
import SpinnerIcon from '../icons/SpinnerIcon';
import { GitStatus, GitFileStatus, GitService, GitCommit, GitFileChange, DiffLine } from '../../types';
import GitIcon from '../icons/GitIcon';
import CodeIcon from '../icons/CodeIcon';
import { performDiff } from '../../utils/diff';

interface GitViewProps {
  files: Record<string, string>;
  changedFiles: GitStatus[];
  onCommit: (message: string) => Promise<void>;
  isCommitting: boolean;
  gitService: GitService | null;
  onBranchSwitch: (branchName: string) => Promise<void>;
  onOpenFileInEditor: (filepath: string) => void;
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


const GitView: React.FC<GitViewProps> = ({ files, changedFiles, onCommit, isCommitting, gitService, onBranchSwitch, onOpenFileInEditor }) => {
  const [commitMessage, setCommitMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [branches, setBranches] = useState<string[]>([]);
  const [activeBranch, setActiveBranch] = useState<string | null>(null);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [selectedCommit, setSelectedCommit] = useState<GitCommit | null>(null);
  const [commitChanges, setCommitChanges] = useState<GitFileChange[]>([]);
  
  const [activeDiffFile, setActiveDiffFile] = useState<GitStatus | GitFileChange | null>(null);
  const [activeDiff, setActiveDiff] = useState<DiffLine[] | null>(null);
  const [isDiffLoading, setIsDiffLoading] = useState(false);

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

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    await onCommit(commitMessage.trim());
    setCommitMessage('');
    setActiveDiffFile(null);
    setActiveDiff(null);
    await loadHistory(activeBranch || undefined);
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
  
  const handleSelectCommitFile = (file: GitFileChange) => {
      setActiveDiffFile(file);
      setActiveDiff(file.diff || null);
  };

  const displayedChanges = selectedCommit ? commitChanges : changedFiles;

  return (
    <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden p-4 gap-4">
      {/* Top Section */}
      <div className="flex-1 flex gap-4 overflow-hidden">
        {/* Left Pane: History */}
        <div className="w-1/2 bg-vibe-panel rounded-lg p-2 flex flex-col">
          <div className="flex-shrink-0 mb-2">
            <label htmlFor="branch-select" className="text-sm font-semibold text-vibe-text-secondary block mb-1">Branch</label>
            <select id="branch-select" value={activeBranch || ''} onChange={e => handleSelectBranch(e.target.value)} disabled={isLoading} className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent disabled:opacity-50">
              {branches.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
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
        {/* Right Pane: Diff */}
        <div className="w-1/2 bg-vibe-panel rounded-lg overflow-hidden">
          <DiffViewer file={activeDiffFile} diff={activeDiff} isLoading={isDiffLoading} onOpenFileInEditor={onOpenFileInEditor} />
        </div>
      </div>

      {/* Bottom Section */}
      <div className="flex-shrink-0 h-2/5 bg-vibe-panel rounded-lg p-2 flex gap-4 overflow-hidden">
        {/* Changes List */}
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
        {/* Commit Box */}
        <div className="w-1/2 flex flex-col">
          <textarea value={commitMessage} onChange={(e) => setCommitMessage(e.target.value)} placeholder="Enter commit message..." rows={3} className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text text-sm focus:outline-none focus:ring-2 focus:ring-vibe-accent disabled:opacity-50 flex-1" disabled={!!selectedCommit || changedFiles.length === 0 || isCommitting} />
          <button onClick={handleCommit} disabled={!!selectedCommit || changedFiles.length === 0 || !commitMessage.trim() || isCommitting} className="w-full mt-2 bg-vibe-accent text-white py-2 rounded-md hover:bg-vibe-accent-hover transition-colors disabled:bg-vibe-comment disabled:cursor-not-allowed flex items-center justify-center">
            {isCommitting ? <SpinnerIcon className="w-5 h-5 mr-2" /> : <GitIcon className="w-5 h-5 mr-2" />}
            {isCommitting ? 'Committing...' : `Commit ${changedFiles.length} File(s)`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default GitView;