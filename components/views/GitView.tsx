import React from 'react';

interface GitViewProps {
  changedFiles: string[];
}

const GitView: React.FC<GitViewProps> = ({ changedFiles }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold mb-3 text-vibe-text">Git Control</h2>
        <div className="flex space-x-2">
          <button className="bg-vibe-accent text-white px-4 py-2 rounded-md hover:bg-vibe-accent-hover transition-colors">Push</button>
          <button className="bg-vibe-panel text-vibe-text-secondary px-4 py-2 rounded-md hover:bg-vibe-comment transition-colors">Pull</button>
          <button className="bg-vibe-panel text-vibe-text-secondary px-4 py-2 rounded-md hover:bg-vibe-comment transition-colors">Fetch</button>
        </div>
      </div>

      <div className="bg-vibe-panel p-4 rounded-lg">
        <h3 className="font-bold mb-2 text-vibe-text-secondary">Changes ({changedFiles.length})</h3>
        {changedFiles.length > 0 ? (
          <ul className="text-sm space-y-1">
            {changedFiles.map((file) => (
              <li key={file} className="flex justify-between items-center text-vibe-text">
                <span>M {file}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-vibe-comment">No changes in the working directory.</p>
        )}
      </div>

      <div className="bg-vibe-panel p-4 rounded-lg">
        <h3 className="font-bold mb-2 text-vibe-text-secondary">Commit</h3>
        <textarea
          placeholder="feat: implement new feature"
          className="w-full h-24 bg-vibe-bg-deep p-2 rounded-md text-sm text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
        />
        <button className="w-full mt-2 bg-vibe-accent text-white py-2 rounded-md hover:bg-vibe-accent-hover transition-colors">
          Commit to 'main'
        </button>
      </div>
    </div>
  );
};

export default GitView;