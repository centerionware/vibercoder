import React from 'react';

// This component is no longer used but is kept to prevent build errors.
const BrowserContentPanel: React.FC = () => {
  return (
      <div className="flex-1 flex flex-col bg-vibe-bg-deep items-center justify-center">
        <p className="text-vibe-comment">The browser view has been removed.</p>
      </div>
  );
};

export default BrowserContentPanel;