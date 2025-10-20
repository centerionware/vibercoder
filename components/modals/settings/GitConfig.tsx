import React, { useState, useEffect } from 'react';
import { AppSettings } from '../../../types';
import { Capacitor } from '@capacitor/core';

interface GitConfigProps {
    settings: AppSettings;
    onSettingsChange: (newSettings: AppSettings) => void;
    onManageCredentials: () => void;
}

const GitConfig: React.FC<GitConfigProps> = ({ settings, onSettingsChange, onManageCredentials }) => {
    const [isNative, setIsNative] = useState(false);

    useEffect(() => {
        setIsNative(Capacitor.isNativePlatform() || !!window.electron?.isElectron);
    }, []);
    
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        onSettingsChange({ ...settings, [e.target.name]: e.target.value });
    };

    return (
        <section>
            <h3 className="text-lg font-semibold text-vibe-text mb-2">Git Configuration (Global Fallback)</h3>
            <div className="bg-vibe-panel p-4 rounded-lg space-y-4">
                {!isNative && (
                    <div>
                        <p className="text-xs text-vibe-comment mb-4">
                            The CORS Proxy URL is required for web-based Git operations. The default public proxy can be unreliable or slow.
                            {' '}<strong className="text-vibe-text-secondary">For best results, we strongly recommend deploying your own free proxy.</strong>
                            {' '}See the `proxy/README.md` file for one-click deployment options. This setting is bypassed in the native apps.
                        </p>
                         <div>
                            <label htmlFor="gitCorsProxy" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                                CORS Proxy URL
                            </label>
                            <input type="text" id="gitCorsProxy" name="gitCorsProxy" value={settings.gitCorsProxy} onChange={handleChange} className="w-full bg-vibe-bg p-2 rounded-md" />
                        </div>
                    </div>
                )}
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