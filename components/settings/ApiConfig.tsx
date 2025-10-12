import React, { useState } from 'react';
import { AppSettings } from '../../types';

interface ApiConfigProps {
    settings: AppSettings;
    onSettingsChange: (newSettings: AppSettings) => void;
}

const ApiConfig: React.FC<ApiConfigProps> = ({ settings, onSettingsChange }) => {
    const [apiKey, setApiKey] = useState(settings.apiKey);

    const handleSave = () => {
        onSettingsChange({ ...settings, apiKey });
    };

    return (
        <section>
            <h3 className="text-lg font-semibold text-vibe-text mb-2">API Configuration</h3>
            <div className="bg-vibe-panel p-4 rounded-lg space-y-4">
                <div>
                    <label htmlFor="api-key" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                        Google Gemini API Key
                    </label>
                    <input
                        id="api-key"
                        type="password"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                        className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
                        placeholder="Enter your API key"
                    />
                    <p className="text-xs text-vibe-comment mt-2">
                        Your key is stored securely in your browser's local storage and is never sent to our servers.
                    </p>
                </div>
                <button
                    onClick={handleSave}
                    disabled={apiKey === settings.apiKey}
                    className="bg-vibe-accent text-white px-4 py-2 rounded-md text-sm hover:bg-vibe-accent-hover transition-colors disabled:bg-vibe-comment disabled:cursor-not-allowed"
                >
                    Save API Key
                </button>
            </div>
        </section>
    );
};

export default ApiConfig;
