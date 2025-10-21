import React, { useState, useEffect } from 'react';
import { BrowserControls } from '../../types';
import ChevronLeftIcon from '../icons/ChevronLeftIcon';
import ChevronRightIcon from '../icons/ChevronRightIcon';
import RotateCcwIcon from '../icons/RotateCcwIcon';

const BrowserContentPanel: React.FC<BrowserControls> = (props) => {
  const { tabs, activeTabId, navigateTo, goBack, goForward, reload, containerRef } = props;
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [urlInput, setUrlInput] = useState(activeTab?.url || '');

  useEffect(() => {
    setUrlInput(activeTab?.url || '');
  }, [activeTab]);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTabId && urlInput) {
      const urlToNavigate = /^(https?|ftp):\/\//i.test(urlInput) ? urlInput : `https://${urlInput}`;
      navigateTo(activeTabId, urlToNavigate);
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-vibe-bg-deep">
      {/* Navigation Bar */}
      <div className="flex-shrink-0 bg-vibe-panel p-2 flex items-center gap-2 border-b border-vibe-bg">
        <button onClick={() => activeTabId && goBack(activeTabId)} disabled={!activeTabId} className="p-2 hover:bg-vibe-bg-deep rounded-full disabled:opacity-50" title="Back">
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <button onClick={() => activeTabId && goForward(activeTabId)} disabled={!activeTabId} className="p-2 hover:bg-vibe-bg-deep rounded-full disabled:opacity-50" title="Forward">
          <ChevronRightIcon className="w-5 h-5" />
        </button>
        <button onClick={() => activeTabId && reload(activeTabId)} disabled={!activeTabId} className="p-2 hover:bg-vibe-bg-deep rounded-full disabled:opacity-50" title="Reload">
          <RotateCcwIcon className="w-5 h-5" />
        </button>
        <form onSubmit={handleNavigate} className="flex-1">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            disabled={!activeTabId}
            className="w-full bg-vibe-bg p-2 rounded-md text-sm text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent disabled:opacity-50"
            placeholder="https://example.com"
          />
        </form>
      </div>

      {/* Browser Content Area */}
      <div ref={containerRef} className="flex-1 relative bg-vibe-bg">
        {!activeTab && (
            <div className="flex h-full flex-col items-center justify-center text-vibe-comment p-4">
                <h2 className="text-2xl font-bold">Browser</h2>
                <p className="mt-2">Open a new tab from the left panel to start browsing.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default BrowserContentPanel;