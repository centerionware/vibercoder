import React from 'react';
import { AppSettings } from '../../types';

interface VoiceAssistantConfigProps {
    settings: AppSettings;
    onSettingsChange: (newSettings: AppSettings) => void;
}

const availableVoices = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];

const VoiceAssistantConfig: React.FC<VoiceAssistantConfigProps> = ({ settings, onSettingsChange }) => {
    
    const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        const isCheckbox = type === 'checkbox';
        const finalValue = isCheckbox ? (e.target as HTMLInputElement).checked : value;
        onSettingsChange({ ...settings, [name]: finalValue });
    };

    return (
        <section>
            <h3 className="text-lg font-semibold text-vibe-text mb-2">Voice Assistant</h3>
            <div className="bg-vibe-panel p-4 rounded-lg space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="liveAiModel" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                            Live/Voice Model
                        </label>
                        <select
                            id="liveAiModel"
                            name="liveAiModel"
                            value={settings.liveAiModel}
                            onChange={handleSettingChange}
                            className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
                        >
                            <option value="gemini-2.5-flash-native-audio-preview-09-2025">Gemini 2.5 Flash (Native Audio)</option>
                        </select>
                    </div>
                    <div>
                        <label htmlFor="voiceName" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                            AI Voice
                        </label>
                        <select
                            id="voiceName"
                            name="voiceName"
                            value={settings.voiceName}
                            onChange={handleSettingChange}
                            className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
                        >
                            {availableVoices.map(voice => (
                                <option key={voice} value={voice}>{voice}</option>
                            ))}
                        </select>
                    </div>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                         <label htmlFor="wakeWord" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                            Wake Word
                        </label>
                        <input
                            type="text"
                            id="wakeWord"
                            name="wakeWord"
                            value={settings.wakeWord}
                            onChange={handleSettingChange}
                            className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
                        />
                    </div>
                    <div className="flex items-center pt-6">
                        <input
                            id="wakeWordEnabled"
                            name="wakeWordEnabled"
                            type="checkbox"
                            checked={settings.wakeWordEnabled}
                            onChange={handleSettingChange}
                            className="h-4 w-4 rounded bg-vibe-bg border-vibe-comment text-vibe-accent focus:ring-vibe-accent"
                        />
                        <label htmlFor="wakeWordEnabled" className="ml-2 text-sm text-vibe-text-secondary">
                            Enable Wake Word
                        </label>
                    </div>
                </div>

                <div className="flex items-center">
                    <input
                        id="autoEnableLiveMode"
                        name="autoEnableLiveMode"
                        type="checkbox"
                        checked={settings.autoEnableLiveMode}
                        onChange={handleSettingChange}
                        className="h-4 w-4 rounded bg-vibe-bg border-vibe-comment text-vibe-accent focus:ring-vibe-accent"
                    />
                    <label htmlFor="autoEnableLiveMode" className="ml-2 text-sm text-vibe-text-secondary">
                        Automatically start voice chat when opening AI view
                    </label>
                </div>
            </div>
        </section>
    );
};

export default VoiceAssistantConfig;