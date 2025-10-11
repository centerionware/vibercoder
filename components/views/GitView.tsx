import React from 'react';
import SpinnerIcon from '../icons/SpinnerIcon';

interface GitViewProps {
  changedFiles: string[];
  onCommit: (message: string) => Promise<void>;
  isCommitting: boolean;
}

const GitView: React.FC<GitViewProps> = ({ changedFiles, onCommit, isCommitting }) => {
  const [commitMessage, setCommitMessage] = React.useState('');

  const handleCommit = () => {
    if (commitMessage.trim()) {
      onCommit(commitMessage.trim());
      setCommitMessage('');
    }
  };

  return (
    <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden p-4 space-y-4">
      <h2 className="text-xl font-bold text-vibe-text">Git Status</h2>
      
      <div className="bg-vibe-panel p-4 rounded-lg flex-1">
        <h3 className="text-lg font-semibold mb-2 text-vibe-text-secondary">Changes ({changedFiles.length})</h3>
        {changedFiles.length > 0 ? (
          <ul className="list-disc list-inside space-y-1 text-vibe-text">
            {changedFiles.map(file => <li key={file}>{file}</li>)}
          </ul>
        ) : (
          <p className="text-vibe-comment">No changes detected since last commit.</p>
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