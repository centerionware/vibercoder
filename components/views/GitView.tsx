import React from 'react';
import SpinnerIcon from '../icons/SpinnerIcon';
import { GitStatus, GitFileStatus } from '../../types';

interface GitViewProps {
  changedFiles: GitStatus[];
  onCommit: (message: string) => Promise<void>;
  isCommitting: boolean;
}

const statusStyles: Record<GitFileStatus, { label: string; color: string }> = {
  [GitFileStatus.New]: { label: 'NEW', color: 'text-green-400' },
  [GitFileStatus.Modified]: { label: 'MOD', color: 'text-yellow-400' },
  [GitFileStatus.Deleted]: { label: 'DEL', color: 'text-red-400' },
  [GitFileStatus.Unmodified]: { label: '', color: '' },
  [GitFileStatus.Absorb]: { label: 'ABS', color: 'text-blue-400' },
};


const GitView: React.FC<GitViewProps> = ({ changedFiles, onCommit, isCommitting }) => {
  const [commitMessage, setCommitMessage] = React.useState('');

  const handleCommit = async () => {
    if (commitMessage.trim()) {
      await onCommit(commitMessage.trim());
      setCommitMessage('');
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden p-4 space-y-4">
      <h2 className="text-xl font-bold text-vibe-text">Git Status</h2>
      
      <div className="bg-vibe-panel p-4 rounded-lg flex-1 overflow-y-auto">
        <h3 className="text-lg font-semibold mb-2 text-vibe-text-secondary">Changes ({changedFiles.length})</h3>
        {changedFiles.length > 0 ? (
          <ul className="space-y-1 text-vibe-text font-mono text-sm">
            {changedFiles.map(file => (
              <li key={file.filepath} className="flex items-center">
                <span className={`w-12 flex-shrink-0 font-bold ${statusStyles[file.status]?.color || ''}`}>
                    {statusStyles[file.status]?.label}
                </span>
                <span>{file.filepath}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-vibe-comment">No changes detected in the working directory.</p>
        )}
      </div>

      <div className="bg-vibe-panel p-4 rounded-lg">
        <h3 className="text-lg font-semibold mb-2 text-vibe-text-secondary">Commit Changes</h3>
        <textarea
          value={commitMessage}
          onChange={(e) => setCommitMessage(e.target.value)}
          placeholder="Enter commit message..."
          rows={3}
          className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
          disabled={changedFiles.length === 0 || isCommitting}
        />
        <button
          onClick={handleCommit}
          disabled={changedFiles.length === 0 || !commitMessage.trim() || isCommitting}
          className="w-full mt-2 bg-vibe-accent text-white py-2 rounded-md hover:bg-vibe-accent-hover transition-colors disabled:bg-vibe-comment disabled:cursor-not-allowed flex items-center justify-center"
        >
          {isCommitting ? <SpinnerIcon className="w-5 h-5 mr-2" /> : null}
          {isCommitting ? 'Committing...' : 'Commit'}
        </button>
      </div>
    </div>
  );
};

export default GitView;