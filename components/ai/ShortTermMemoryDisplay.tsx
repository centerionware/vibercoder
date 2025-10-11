import React, { useState } from 'react';
import { ShortTermMemory } from '../../types';
import ChevronDownIcon from '../icons/ChevronDownIcon';

interface ShortTermMemoryDisplayProps {
  memory: ShortTermMemory;
}

const ShortTermMemoryDisplay: React.FC<ShortTermMemoryDisplayProps> = ({ memory }) => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="flex-shrink-0 border-b border-vibe-panel bg-vibe-bg-deep/50">
      <button
        onClick={() => setIsOpen(p => !p)}
        className="flex items-center w-full p-2 text-left text-sm font-semibold text-vibe-text-secondary hover:bg-vibe-panel"
      >
        <span>AI's Working Memory</span>
        <ChevronDownIcon
          className={`w-5 h-5 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="p-3 text-xs font-mono bg-vibe-bg-deep text-vibe-text">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(
              Object.fromEntries(
                Object.entries(memory).map(([key, value]) => [key, value.value])
              ),
              null,
              2
            )}
          </pre>
        </div>
      )}
    </div>
  );
};

export default ShortTermMemoryDisplay;
