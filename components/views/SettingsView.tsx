import React from 'react';
import { AppSettings, GitCredential, View } from '../../types';
import ApiConfig from '../modals/settings/ApiConfig';
import AiModelConfig from '../modals/settings/AiModelConfig';
import VoiceAssistantConfig from '../modals/settings/VoiceAssistantConfig';
import GitConfig from '../modals/settings/GitConfig';
import AiPromptConfig from '../modals/settings/AiPromptConfig';

interface SettingsViewProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  gitCredentials: GitCredential[];
  onManageCredentials: () => void;
  onOpenDebugLog: () => void;
  onNavigate: (view: View) => void;
}

const SettingsView: React.FC<SettingsViewProps> = (props) => {
  const { settings, onSettingsChange, gitCredentials, onManageCredentials, onOpenDebugLog, onNavigate } = props;
  return (
    <div className="flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-y-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h2 className="text-2xl font-bold text-vibe-text">Settings</h2>
          <p className="text-vibe-text-secondary mt-1">
            Configure your AIDE environment. Changes are saved automatically.
          </p>
        </header>
        
        <ApiConfig settings={settings} onSettingsChange={onSettingsChange} />
        <AiModelConfig settings={settings} onSettingsChange={onSettingsChange} />
        <AiPromptConfig onNavigate={onNavigate} />
        <VoiceAssistantConfig settings={settings} onSettingsChange={onSettingsChange} />
        <GitConfig 
          settings={settings} 
          onSettingsChange={onSettingsChange}
          onManageCredentials={onManageCredentials}
        />
        <section>
          <h3 className="text-lg font-semibold text-vibe-text mb-2">Debugging</h3>
          <div className="bg-vibe-panel p-4 rounded-lg">
              <button
                  onClick={onOpenDebugLog}
                  className="bg-vibe-bg-deep text-vibe-text-secondary px-4 py-2 rounded-md text-sm hover:bg-vibe-comment transition-colors"
              >
                  View Debug Log
              </button>
              <p className="text-xs text-vibe-comment mt-2">
                  View all console messages from this session to help diagnose issues.
              </p>
          </div>
        </section>

      </div>
    </div>
  );
};

export default SettingsView;