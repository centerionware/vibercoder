import React from 'react';
import { AppSettings, GitCredential } from '../../types';
import ApiConfig from '../modals/settings/ApiConfig';
import AiModelConfig from '../modals/settings/AiModelConfig';
import VoiceAssistantConfig from '../modals/settings/VoiceAssistantConfig';
import GitConfig from '../modals/settings/GitConfig';

interface SettingsViewProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  gitCredentials: GitCredential[];
  onManageCredentials: () => void;
}

const SettingsView: React.FC<SettingsViewProps> = (props) => {
  const { settings, onSettingsChange, gitCredentials, onManageCredentials } = props;
  return (
    <div className="flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-y-auto p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header>
          <h2 className="text-2xl font-bold text-vibe-text">Settings</h2>
          <p className="text-vibe-text-secondary mt-1">
            Configure your VibeCode environment. Changes are saved automatically.
          </p>
        </header>
        
        <ApiConfig settings={settings} onSettingsChange={onSettingsChange} />
        <AiModelConfig settings={settings} onSettingsChange={onSettingsChange} />
        <VoiceAssistantConfig settings={settings} onSettingsChange={onSettingsChange} />
        <GitConfig 
          settings={settings} 
          onSettingsChange={onSettingsChange}
          onManageCredentials={onManageCredentials}
        />

      </div>
    </div>
  );
};

export default SettingsView;