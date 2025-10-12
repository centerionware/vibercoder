import React from 'react';
import { AppSettings } from '../../../types';

interface GitConfigProps {
    settings: AppSettings;
    onSettingsChange: (newSettings: AppSettings) => void;
    onManageCredentials: () => void;
}

const GitConfig: React.FC<GitConfigProps> = ({ settings, onSettingsChange, onManageCredentials }) => {
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onSettingsChange({ ...settings, [e.target.name]: e.target.value });
    };

    return (
        <section>
            <h3 className="text-lg font-semibold text-vibe-text mb-2">Git Configuration (Global Fallback)</h3>
            <div className="bg-vibe-panel p-4 rounded-lg space-y-4">
                <p className="text-xs text-vibe-comment">
                    These are the default global settings. They can be overridden by project-specific settings.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label htmlFor="gitUserName" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                            User Name
                        </label>
                        <input type="text" id="gitUserName" name="gitUserName" value={settings.gitUserName} onChange={handleChange} className="w-full bg-vibe-bg p-2 rounded-md" placeholder="Your Name"/>
                    </div>
                    <div>
                        <label htmlFor="gitUserEmail" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                            User Email
                        </label>
                        <input type="email" id="gitUserEmail" name="gitUserEmail" value={settings.gitUserEmail} onChange={handleChange} className="w-full bg-vibe-bg p-2 rounded-md" placeholder="your@email.com"/>
                    </div>
                </div>
                <div>
                    <label htmlFor="gitCorsProxy" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                        CORS Proxy URL
                    </label>
                    <input type="text" id="gitCorsProxy" name="gitCorsProxy" value={settings.gitCorsProxy} onChange={handleChange} className="w-full bg-vibe-bg p-2 rounded-md" />
                </div>
                 <div>
                    <button
                        onClick={onManageCredentials}
                        className="bg-vibe-bg-deep text-vibe-text-secondary px-4 py-2 rounded-md text-sm hover:bg-vibe-comment transition-colors"
                    >
                        Manage Saved Credentials
                    </button>
                    <p className="text-xs text-vibe-comment mt-2">
                        Manage multiple authentication tokens for different Git providers (e.g., GitHub, GitLab).
                    </p>
                </div>
            </div>
        </section>
    );
};

export default GitConfig;