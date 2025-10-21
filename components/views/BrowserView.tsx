import React from 'react';
import { BrowserControls } from '../../types';
import TabList from '../browser/TabList';
import BrowserContentPanel from '../browser/BrowserContentPanel';

const BrowserView: React.FC<BrowserControls> = (props) => {
  return (
    <div className="flex flex-1 h-full bg-vibe-bg-deep overflow-hidden">
      <TabList
        tabs={props.tabs}
        activeTabId={props.activeTabId}
        isCollapsed={props.isTabBarCollapsed}
        onNewTab={props.openNewTab}
        onCloseTab={props.closeTab}
        onSwitchTab={props.switchToTab}
        onToggleCollapse={props.toggleTabBar}
      />
      <div className="flex-1 flex flex-col min-w-0">
        <BrowserContentPanel {...props} />
      </div>
    </div>
  );
};

export default BrowserView;