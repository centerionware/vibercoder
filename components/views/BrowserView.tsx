import React from 'react';

// This component is no longer used but is kept to prevent build errors
// from lingering file references in some environments.
const BrowserView: React.FC = () => {
  return (
    <div className="flex flex-1 h-full bg-vibe-bg-deep items-center justify-center">
        <p className="text-vibe-comment">The browser view has been removed.</p>
    </div>
  );
};

export default BrowserView;