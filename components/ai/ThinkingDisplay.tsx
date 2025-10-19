import React, { useState, useEffect } from 'react';
import ChevronDownIcon from '../icons/ChevronDownIcon';

interface ThinkingDisplayProps {
    content: string;
}

const ThinkingDisplay: React.FC<ThinkingDisplayProps> = ({ content }) => {
    const [isOpen, setIsOpen] = useState(false);

    // Automatically expand if new content is added while closed.
    useEffect(() => {
        if (content && !isOpen) {
            setIsOpen(true);
        }
        // We only want this effect to run when `content` changes, not `isOpen`.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [content]);

    if (!content) return null;

    return (
        <div className="mt-2 border-t border-vibe-comment/30 pt-2">
            <button onClick={() => setIsOpen(p => !p)} className="flex items-center text-xs w-full font-semibold text-vibe-text-secondary">
                <span>AI Activity Log</span>
                <ChevronDownIcon className={`w-4 h-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <div className="mt-2 text-xs p-2 rounded-md bg-vibe-bg-deep font-mono text-vibe-comment">
                     <pre className="whitespace-pre-wrap font-sans">{content}</pre>
                </div>
            )}
        </div>
    );
}

export default ThinkingDisplay;