
import React from 'react';

const Header: React.FC = () => {
  return (
    <header className="bg-vibe-bg-deep p-3 flex justify-between items-center border-b border-vibe-panel shadow-lg">
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 bg-gradient-to-br from-vibe-accent to-vibe-accent-hover rounded-lg"></div>
        <h1 className="text-xl font-bold text-vibe-text">VibeCode</h1>
      </div>
      <div className="flex items-center space-x-4">
        <span className="text-sm bg-vibe-panel px-3 py-1 rounded-md text-vibe-text-secondary">
          my-awesome-project
        </span>
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
