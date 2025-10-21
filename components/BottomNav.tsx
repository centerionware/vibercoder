import React from 'react';
import { View } from '../types';
import CodeIcon from './icons/CodeIcon';
import PreviewIcon from './icons/PreviewIcon';
import AiIcon from './icons/AiIcon';
import GitIcon from './icons/GitIcon';
import SettingsIcon from './icons/SettingsIcon';
import BrowserIcon from './icons/BrowserIcon';

interface BottomNavProps {
  activeView: View;
  onNavigate: (view: View) => void;
}

const navItems = [
  { view: View.Code, label: 'Code', icon: CodeIcon },
  { view: View.Preview, label: 'Preview', icon: PreviewIcon },
  { view: View.Ai, label: 'AI', icon: AiIcon },
  { view: View.Browser, label: 'Browser', icon: BrowserIcon },
  { view: View.Git, label: 'Git', icon: GitIcon },
  { view: View.Settings, label: 'Settings', icon: SettingsIcon },
];

const BottomNav: React.FC<BottomNavProps> = ({ activeView, onNavigate }) => {
  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-vibe-bg-deep border-t border-vibe-panel flex justify-around p-2">
      {navItems.map((item) => {
        const isActive = activeView === item.view;
        return (
          <button
            key={item.view}
            onClick={() => onNavigate(item.view)}
            className={`flex flex-col items-center justify-center w-20 h-14 rounded-lg transition-all duration-200 ${
              isActive ? 'bg-vibe-accent text-white' : 'text-vibe-text-secondary hover:bg-vibe-panel'
            }`}
          >
            <item.icon className="w-6 h-6 mb-1" />
            <span className="text-xs font-semibold">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNav;