import React from 'react';
import { BrowserControls } from '../../types';

const BrowserContentPanel: React.FC<BrowserControls> = (props) => {
  const { tabs, activeTabId, containerRef } = props;
  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div className="flex-1 flex flex-col bg-vibe-bg-deep">
      {/* The container ref is kept for interface compatibility, but the content is now informational. */}
      <div ref={containerRef} className="flex-1 relative bg-vibe-bg flex flex-col items-center justify-center text-center p-4">
        {activeTab ? (
          <>
            <h2 className="text-2xl font-bold text-vibe-text">Browser Active</h2>
            <p className="mt-2 text-vibe-comment max-w-md">
              The page for "<span className="text-vibe-text-secondary truncate">{activeTab.title}</span>" is open in a full-screen view.
            </p>
            <p className="mt-1 text-vibe-comment">
              Use the controls provided by the browser to navigate or close it.
            </p>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-vibe-text">Browser</h2>
            <p className="mt-2 text-vibe-comment">
              Open a new tab from the left panel to start browsing.
            </p>
          </>
        )}
      </div>
    </div>
  );
};

export default BrowserContentPanel;