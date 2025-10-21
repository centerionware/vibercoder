import React from 'react';
import { BrowserTab } from '../../types';
import PlusIcon from '../icons/PlusIcon';
import XIcon from '../icons/XIcon';
import SpinnerIcon from '../icons/SpinnerIcon';
import ChevronsLeftIcon from '../icons/ChevronsLeftIcon';
import ChevronsRightIcon from '../icons/ChevronsRightIcon';

interface TabListProps {
  tabs: BrowserTab[];
  activeTabId: string | null;
  isCollapsed: boolean;
  onNewTab: () => void;
  onCloseTab: (tabId: string) => void;
  onSwitchTab: (tabId: string) => void;
  onToggleCollapse: () => void;
}

const TabList: React.FC<TabListProps> = (props) => {
  const { tabs, activeTabId, isCollapsed, onNewTab, onCloseTab, onSwitchTab, onToggleCollapse } = props;

  return (
    <div className={`bg-vibe-panel p-2 flex flex-col flex-shrink-0 transition-all duration-300 border-r border-vibe-bg-deep ${isCollapsed ? 'w-16' : 'w-64'}`}>
      <div className={`flex items-center mb-2 ${isCollapsed ? 'justify-center' : 'justify-between'}`}>
        {!isCollapsed && <h3 className="text-sm font-semibold text-vibe-text-secondary uppercase tracking-wider">TABS</h3>}
        <button onClick={onNewTab} className="p-2 hover:bg-vibe-bg-deep rounded" title="New Tab">
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-1">
        {tabs.map(tab => {
          const isActive = tab.id === activeTabId;
          return (
            <div
              key={tab.id}
              onClick={() => onSwitchTab(tab.id)}
              className={`group flex items-center p-2 rounded-md cursor-pointer transition-colors ${isActive ? 'bg-vibe-accent text-white' : 'hover:bg-vibe-bg-deep text-vibe-text-secondary'}`}
              title={tab.title}
            >
              {tab.isLoading ? (
                <SpinnerIcon className="w-5 h-5 flex-shrink-0 text-vibe-accent"/>
              ) : (
                <img src={tab.favicon || 'about:blank'} alt="" className="w-5 h-5 flex-shrink-0 rounded-sm" onError={(e) => (e.currentTarget.style.display = 'none')} />
              )}
              {!isCollapsed && (
                <span className="ml-2 truncate flex-1 text-sm">{tab.title}</span>
              )}
              {!isCollapsed && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.id);
                  }}
                  className={`ml-2 p-1 rounded opacity-0 group-hover:opacity-100 ${isActive ? 'hover:bg-white/20' : 'hover:bg-vibe-comment'}`}
                  title="Close Tab"
                >
                  <XIcon className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <button onClick={onToggleCollapse} className="mt-2 p-2 hover:bg-vibe-bg-deep rounded flex items-center justify-center" title={isCollapsed ? 'Expand Tabs' : 'Collapse Tabs'}>
        {isCollapsed ? <ChevronsRightIcon className="w-5 h-5"/> : <ChevronsLeftIcon className="w-5 h-5"/>}
      </button>
    </div>
  );
};

export default TabList;