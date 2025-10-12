import React from 'react';

interface HeaderProps {
  isLiveVideoEnabled: boolean;
  onLiveVideoIconClick: () => void;
  projectName: string;
  onProjectNameClick: () => void;
  onTitleClick: () => void;
}

const Header: React.FC<HeaderProps> = ({ isLiveVideoEnabled, onLiveVideoIconClick, projectName, onProjectNameClick, onTitleClick }) => {
  return (
    <header className="bg-vibe-bg-deep p-3 flex justify-between items-center border-b border-vibe-panel shadow-lg">
      <button onClick={onTitleClick} className="flex items-center space-x-3 hover:opacity-80 transition-opacity">
        <div className="w-8 h-8 bg-gradient-to-br from-vibe-accent to-vibe-accent-hover rounded-lg"></div>
        <h1 className="text-xl font-bold text-vibe-text">VibeCode</h1>
      </button>
      <div className="flex items-center space-x-4">
        {isLiveVideoEnabled && (
          <button
            onClick={onLiveVideoIconClick}
            className="text-xl animate-pulse p-1 rounded-md hover:bg-vibe-panel"
            aria-label="View live video stream"
            title="View live video stream"
          >
            📸
          </button>
        )}
        <button 
          onClick={onProjectNameClick}
          className="text-sm bg-vibe-panel px-3 py-1 rounded-md text-vibe-text-secondary hover:bg-vibe-comment transition-colors"
          title="Switch project"
        >
          {projectName}
        </button>
        <img
          src="https://picsum.photos/100"
          alt="User Avatar"
          className="w-8 h-8 rounded-full border-2 border-vibe-accent"
        />
      </div>
    </header>
  );
};

export default Header;
