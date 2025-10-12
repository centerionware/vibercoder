import React from 'react';
import { AppSettings } from '../../../types';

interface AiModelConfigProps {
    settings: AppSettings;
    onSettingsChange: (newSettings: AppSettings) => void;
}

const availableModels = [
    { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', details: 'The recommended model for general tasks.' },
];

const AiModelConfig: React.FC<AiModelConfigProps> = ({ settings, onSettingsChange }) => {
    
    const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
        const { name, value, type } = e.target;
        const finalValue = type === 'number' ? (value === '' ? null : Number(value)) : value;
        onSettingsChange({ ...settings, [name]: finalValue });
    };

    return (
        <section>
            <h3 className="text-lg font-semibold text-vibe-text mb-2">AI Model</h3>
            <div className="bg-vibe-panel p-4 rounded-lg grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label htmlFor="aiModel" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                        Chat & Tool Model
                    </label>
                    <select
                        id="aiModel"
                        name="aiModel"
                        value={settings.aiModel}
                        onChange={handleChange}
                        className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
                    >
                        {availableModels.map(model => (
                            <option key={model.id} value={model.id}>{`${model.name} - ${model.details}`}</option>
                        ))}
                    </select>
                </div>
                <div>
                     <label htmlFor="thinkingBudget" className="block text-sm font-medium text-vibe-text-secondary mb-1">
                        Thinking Budget (Optional)
                    </label>
                    <input
                        type="number"
                        id="thinkingBudget"
                        name="thinkingBudget"
                        value={settings.thinkingBudget ?? ''}
                        onChange={handleChange}
                        placeholder="Default"
                        className="w-full bg-vibe-bg p-2 rounded-md text-vibe-text focus:outline-none focus:ring-2 focus:ring-vibe-accent"
                    />
                    <p className="text-xs text-vibe-comment mt-2">
                        For 'gemini-2.5-flash' only. Controls token usage for thinking. Leave blank for default behavior.
                    </p>
                </div>
            </div>
        </section>
    );
};

export default AiModelConfig;