import React, { useState, useEffect } from 'react';
import { AppSettings, AiProvider } from '../../types';

interface ModelInfo {
  id: string;
  name: string;
  provider: AiProvider;
  type: 'text' | 'image' | 'video' | 'live';
  rateLimits: {
    rpm: string; // Requests Per Minute
    rpd: string; // Requests Per Day
  };
}

// FIX: Removed deprecated and prohibited models to comply with Gemini API guidelines.
const availableModels: ModelInfo[] = [
  // Text Models
  {
    id: 'gemini-2.5-flash',
    name: 'Gemini 2.5 Flash',
    provider: AiProvider.Google,
    type: 'text',
    rateLimits: { rpm: '10', rpd: '250' },
  },
  // Image Models
  {
    id: 'imagen-4.0-generate-001',
    name: 'Imagen 4.0',
    provider: AiProvider.Google,
    type: 'image',
    rateLimits: { rpm: 'N/A', rpd: 'N/A' }, // Specific limits not detailed in the same way
  },
  // Video Models
  {
    id: 'veo-2.0-generate-001',
    name: 'Veo 2.0',
    provider: AiProvider.Google,
    type: 'video',
    rateLimits: { rpm: 'N/A', rpd: 'N/A' }, // Specific limits not detailed in the same way
  },
   // Live Models
  {
    id: 'gemini-2.5-flash-native-audio-preview-09-2025',
    name: 'Gemini 2.5 Flash (Live Audio)',
    provider: AiProvider.Google,
    type: 'live',
    rateLimits: { rpm: '1 session', rpd: '5' },
  },
];


interface SettingsViewProps {
  settings: AppSettings;
  onSettingsChange: (settings: AppSettings) => void;
  onGitImport: () => void;
  isCloning: boolean;
}

const SettingsView: React.FC<SettingsViewProps> = ({ settings, onSettingsChange, onGitImport, isCloning }) => {
  const [localSettings, setLocalSettings] = useState<AppSettings>(settings);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    setLocalSettings(settings);
  }, [settings]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setLocalSettings(prev => ({ 
        ...prev, 
        [name]: (e.target as HTMLInputElement).type === 'number' ? parseInt(value, 10) : value 
    }));
  };
  
  const handleSave = () => {
    onSettingsChange(localSettings);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const modelsByProvider = availableModels.filter(m => m.provider === localSettings.aiProvider);
  const textModels = modelsByProvider.filter(m => m.type === 'text');
  
  // Note: For now, we only allow selecting text models for the main AI chat functionality.
  // The multi-modal models are used implicitly by the new tools.
  const selectedModelInfo = textModels.find(m => m.id === localSettings.aiModel);

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-vibe-text">Settings</h2>

      {/* AI Settings */}
      <div className="bg-vibe-panel p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 text-vibe-text-secondary">AI Configuration</h3>
        <p className="text-sm text-vibe-comment mb-4">The Google Gemini API key is configured securely via the <code>API_KEY</code> environment variable.</p>
        <div className="space-y-4">
          <div>
            <label htmlFor="aiProvider" className="block text-sm font-medium text-vibe-text mb-1">
              AI Provider
            </label>
            <select
              id="aiProvider"
              name="aiProvider"
              value={localSettings.aiProvider}
              onChange={handleChange}
              className="w-full bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment focus:outline-none focus:ring-2 focus:ring-vibe-accent"
            >
              <option value={AiProvider.Google}>Google Gemini</option>
              <option value={AiProvider.Anthropic} disabled>Anthropic Claude (coming soon)</option>
              <option value={AiProvider.OpenAI} disabled>OpenAI (coming soon)</option>
            </select>
          </div>
          <div>
            <label htmlFor="aiModel" className="block text-sm font-medium text-vibe-text mb-1">
              Primary Chat & Code Model
            </label>
            <select
              id="aiModel"
              name="aiModel"
              value={localSettings.aiModel}
              onChange={handleChange}
              className="w-full bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment focus:outline-none focus:ring-2 focus:ring-vibe-accent"
              disabled={textModels.length === 0}
            >
              {textModels.length > 0 ? (
                textModels.map(model => (
                  <option key={model.id} value={model.id}>{model.name}</option>
                ))
              ) : (
                <option>No text models available</option>
              )}
            </select>
             {selectedModelInfo && (
                <div className="text-xs text-vibe-comment mt-2 bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment/50">
                    <p><strong>Free Tier Rate Limits for {selectedModelInfo.name}:</strong></p>
                    <ul className="list-disc list-inside mt-1">
                        <li>{selectedModelInfo.rateLimits.rpm} requests per minute</li>
                        <li>{selectedModelInfo.rateLimits.rpd} requests per day</li>
                    </ul>
                    <p className="mt-1 italic">Note: These are total limits provided by Google, not a live view of remaining quota.</p>
                </div>
              )}
          </div>
          
          {localSettings.aiModel === 'gemini-2.5-flash' && (
             <div>
                <label htmlFor="thinkingBudget" className="block text-sm font-medium text-vibe-text mb-1">
                    Thinking Budget
                </label>
                <input
                    type="number"
                    id="thinkingBudget"
                    name="thinkingBudget"
                    value={localSettings.thinkingBudget ?? 100}
                    onChange={handleChange}
                    step="50"
                    min="0"
                    className="w-full bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment focus:outline-none focus:ring-2 focus:ring-vibe-accent"
                />
                 <p className="text-xs text-vibe-comment mt-1">For Gemini Flash. Controls the tradeoff between response quality and latency. Higher values allow more "thinking" time for better quality but increase latency. Set to 0 to disable thinking for the fastest response.</p>
             </div>
          )}

          <div className="text-xs text-vibe-comment mt-2 bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment/50">
             <p><strong>Specialized Models:</strong></p>
             <p className="mt-1">The AI will automatically use these models for specific tasks:</p>
             <ul className="list-disc list-inside mt-1">
                 <li><strong>Images:</strong> `imagen-4.0-generate-001`</li>
                 <li><strong>Videos:</strong> `veo-2.0-generate-001`</li>
                 <li><strong>Voice Chat:</strong> `gemini-2.5-flash-native-audio-preview-09-2025`</li>
             </ul>
          </div>
          <div>
            <label htmlFor="aiEndpoint" className="block text-sm font-medium text-vibe-text mb-1">
              Custom Endpoint (Optional)
            </label>
            <input
              type="text"
              id="aiEndpoint"
              name="aiEndpoint"
              value={localSettings.aiEndpoint}
              onChange={handleChange}
              placeholder="e.g., for proxies or local models"
              className="w-full bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment focus:outline-none focus:ring-2 focus:ring-vibe-accent"
            />
             <p className="text-xs text-vibe-comment mt-1">Leave blank to use the default provider endpoint.</p>
          </div>
        </div>
      </div>

      {/* Git Connection */}
      <div className="bg-vibe-panel p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 text-vibe-text-secondary">Git Connection (CORS Proxy)</h3>
        <p className="text-sm text-vibe-comment mb-4">To securely connect to GitHub from the browser, a CORS proxy is required. You can deploy our open-source, minimal proxy to your own cloud account for free with one click.</p>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <button onClick={() => alert('Coming Soon!')} className="flex-1 text-center py-2 px-4 rounded-md bg-[#000000] text-white hover:bg-gray-800 transition-colors">Deploy with Vercel</button>
            <button onClick={() => alert('Coming Soon!')} className="flex-1 text-center py-2 px-4 rounded-md bg-[#00C7B7] text-white hover:bg-teal-500 transition-colors">Deploy with Netlify</button>
            <button onClick={() => alert('Coming Soon!')} className="flex-1 text-center py-2 px-4 rounded-md bg-[#F38020] text-white hover:bg-orange-600 transition-colors">Deploy with Cloudflare</button>
        </div>
         <div>
            <label htmlFor="gitProxyUrl" className="block text-sm font-medium text-vibe-text mb-1">
                Deployed Proxy URL
            </label>
            <input
                type="text"
                id="gitProxyUrl"
                name="gitProxyUrl"
                value={localSettings.gitProxyUrl}
                onChange={handleChange}
                placeholder="Paste your deployed proxy URL here"
                className="w-full bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment focus:outline-none focus:ring-2 focus:ring-vibe-accent"
            />
             <p className="text-xs text-vibe-comment mt-1">After deploying, paste the URL here to enable Git operations.</p>
          </div>
      </div>

      {/* Git Settings */}
      <div className="bg-vibe-panel p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 text-vibe-text-secondary">Git Configuration</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="gitRemoteUrl" className="block text-sm font-medium text-vibe-text mb-1">
                Git Remote URL
            </label>
            <input
                type="text"
                id="gitRemoteUrl"
                name="gitRemoteUrl"
                value={localSettings.gitRemoteUrl}
                onChange={handleChange}
                placeholder="https://github.com/user/repo.git"
                className="w-full bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment focus:outline-none focus:ring-2 focus:ring-vibe-accent"
            />
          </div>
          <div>
            <label htmlFor="gitUserName" className="block text-sm font-medium text-vibe-text mb-1">
              Git User Name
            </label>
            <input
              type="text"
              id="gitUserName"
              name="gitUserName"
              value={localSettings.gitUserName}
              onChange={handleChange}
              placeholder="Your name for commits"
              className="w-full bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment focus:outline-none focus:ring-2 focus:ring-vibe-accent"
            />
          </div>
          <div>
            <label htmlFor="gitUserEmail" className="block text-sm font-medium text-vibe-text mb-1">
              Git User Email
            </label>
            <input
              type="email"
              id="gitUserEmail"
              name="gitUserEmail"
              value={localSettings.gitUserEmail}
              onChange={handleChange}
              placeholder="your.email@example.com"
              className="w-full bg-vibe-bg-deep p-2 rounded-md border border-vibe-comment focus:outline-none focus:ring-2 focus:ring-vibe-accent"
            />
          </div>
        </div>
      </div>
      
      {/* Git Import */}
      <div className="bg-vibe-panel p-6 rounded-lg">
        <h3 className="text-lg font-semibold mb-4 text-vibe-text-secondary">Import Project from Git</h3>
         <div className="space-y-4">
            <p className="text-sm text-vibe-comment">
                This will clone the repository from the Git Remote URL specified in the configuration above.
                <br/>
                <strong className="text-red-400">Warning:</strong> This will replace your current workspace.
            </p>
            <button
                onClick={onGitImport}
                disabled={isCloning || !localSettings.gitRemoteUrl}
                className="w-full bg-vibe-accent text-white py-2 rounded-md hover:bg-vibe-accent-hover transition-colors disabled:bg-vibe-comment disabled:cursor-not-allowed"
            >
                {isCloning ? 'Cloning...' : 'Import Project'}
            </button>
         </div>
      </div>

      <div className="flex justify-end items-center">
        {saveStatus === 'saved' && <span className="text-sm text-vibe-accent-hover mr-4">Settings saved!</span>}
        <button
          onClick={handleSave}
          className="bg-vibe-accent text-white px-6 py-2 rounded-md hover:bg-vibe-accent-hover transition-colors"
        >
          Save All Settings
        </button>
      </div>
    </div>
  );
};

export default SettingsView;
