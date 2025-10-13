import React from 'react';
import { View } from '../../../types';
import LightbulbIcon from '../../icons/LightbulbIcon';

interface AiPromptConfigProps {
    onNavigate: (view: View) => void;
}

const AiPromptConfig: React.FC<AiPromptConfigProps> = ({ onNavigate }) => {
    return (
        <section>
            <h3 className="text-lg font-semibold text-vibe-text mb-2">AI Prompt Library</h3>
            <div className="bg-vibe-panel p-4 rounded-lg">
                <p className="text-sm text-vibe-text-secondary mb-4">
                    Manage the versioned library of instructions that define the AI's core behavior, operational protocols, and specialized skills.
                </p>
                <button
                    onClick={() => onNavigate(View.Prompts)}
                    className="bg-vibe-bg-deep text-vibe-text-secondary px-4 py-2 rounded-md text-sm hover:bg-vibe-comment transition-colors flex items-center gap-2"
                >
                    <LightbulbIcon className="w-5 h-5" />
                    Manage Prompts
                </button>
            </div>
        </section>
    );
};

export default AiPromptConfig;
