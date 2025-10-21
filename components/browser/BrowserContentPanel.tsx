import React, { useState, useEffect } from 'react';
import { BrowserControls } from '../../types';
import ChevronLeftIcon from '../icons/ChevronLeftIcon';
import ChevronRightIcon from '../icons/ChevronRightIcon';
import RotateCcwIcon from '../icons/RotateCcwIcon';
import SpinnerIcon from '../icons/SpinnerIcon';

const BrowserContentPanel: React.FC<BrowserControls> = (props) => {
  const { tabs, activeTabId, navigateTo, goBack, goForward, reload } = props;
  const activeTab = tabs.find(t => t.id === activeTabId);
  const [urlInput, setUrlInput] = useState(activeTab?.url || '');

  useEffect(() => {
    setUrlInput(activeTab?.url || '');
  }, [activeTab]);

  const handleNavigate = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTabId && urlInput) {
      navigateTo(activeTabId, urlInput);
    }
  };

  if (!activeTab) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-vibe-comment p-4">
        <h2 className="text-2xl font-bold">Browser is Idle</h2>
        <p className="mt-2">Open a new tab to start browsing.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col bg-vibe-bg-deep">
      <div className="flex-shrink-0 bg-vibe-panel p-2 flex items-center gap-2 border-b border-vibe-bg">
        <button onClick={() => goBack(activeTabId)} className="p-2 hover:bg-vibe-bg-deep rounded-full" title="Back">
          <ChevronLeftIcon className="w-5 h-5" />
        </button>
        <button onClick={() => goForward(activeTabId)} className="p-2 hover:bg-vibe-bg-deep rounded-full" title="Forward">
          <ChevronRightIcon className="w-5 h-5" />
        </button>
        <button onClick={() => reload(activeTabId)} className="p-2 hover:bg-vibe-bg-deep rounded-full" title="Reload">
          <RotateCcwIcon className="w-5 h-5" />
        </button>
        <form onSubmit={handleNavigate} className="flex-1">
          <input
            type="text"
            value={urlInput}
            onChange={(e) => setUrlInput(e.target.value)}
            className="w-full bg-vibe-bg p-2 rounded-md text-sm text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
            placeholder="https://example.com"
          />
        </form>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center p-4 text-center">
        {activeTab.isLoading ? (
            <>
                <SpinnerIcon className="w-12 h-12 text-vibe-accent mb-4"/>
                <h2 className="text-xl font-semibold text-vibe-text-secondary">Loading...</h2>
                <p className="text-sm text-vibe-comment truncate max-w-full mt-2">{activeTab.url}</p>
            </>
        ) : (
            <>
                <img src={activeTab.favicon || 'about:blank'} alt="" className="w-16 h-16 mb-4 rounded-lg"/>
                <h2 className="text-2xl font-bold text-vibe-text truncate max-w-full">{activeTab.title}</h2>
                <p className="text-sm text-vibe-comment truncate max-w-full mt-2">{activeTab.url}</p>
                <p className="mt-8 text-vibe-text-secondary">This browser view is active.</p>
                <p className="text-xs text-vibe-comment">Web content is displayed in a separate, full-screen native window.</p>
            </>
        )}
      </div>
    </div>
  );
};

export default BrowserContentPanel;