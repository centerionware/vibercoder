
import React from 'react';
import MicrophoneIcon from './icons/MicrophoneIcon';
import MicrophoneOffIcon from './icons/MicrophoneOffIcon';

interface HeaderProps {
  isLiveVideoEnabled: boolean;
  onLiveVideoIconClick: () => void;
  projectName: string;
  onProjectNameClick: () => void;
  onTitleClick: () => void;
  isLive: boolean;
  isMuted: boolean;
  onToggleMute: () => void;
}

const Header: React.FC<HeaderProps> = ({ 
  isLiveVideoEnabled, onLiveVideoIconClick, 
  projectName, onProjectNameClick, 
  onTitleClick,
  isLive, isMuted, onToggleMute 
}) => {
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
        {isLive && (
          <button
            onClick={onToggleMute}
            className={`p-2 rounded-full transition-colors ${
              isMuted
                ? 'bg-yellow-500/30 text-yellow-300'
                : 'bg-vibe-panel text-vibe-text-secondary'
            }`}
            aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
            title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
          >
            {isMuted ? (
              <MicrophoneOffIcon className="w-5 h-5" />
            ) : (
              <MicrophoneIcon className="w-5 h-5" />
            )}
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