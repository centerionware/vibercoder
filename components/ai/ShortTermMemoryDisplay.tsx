import React, { useState, useEffect } from 'react';
import { ShortTermMemory } from '../../types';
import ChevronDownIcon from '../icons/ChevronDownIcon';

interface ShortTermMemoryDisplayProps {
  memory?: ShortTermMemory;
}

const ShortTermMemoryDisplay: React.FC<ShortTermMemoryDisplayProps> = ({ memory }) => {
  const hasMemory = memory && Object.keys(memory).length > 0;
  // Default to closed to be less intrusive.
  const [isOpen, setIsOpen] = useState(false);

  // If memory gets populated for the first time in this component's lifecycle, open it to show the user.
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false);
  useEffect(() => {
    if (hasMemory && !hasOpenedOnce) {
      setIsOpen(true);
      setHasOpenedOnce(true);
    }
  }, [hasMemory, hasOpenedOnce]);

  return (
    <div className="flex-shrink-0 border-b border-vibe-panel bg-vibe-bg-deep/50">
      <button
        onClick={() => setIsOpen(p => !p)}
        className={`flex items-center w-full p-2 text-left text-sm font-semibold ${hasMemory ? 'text-vibe-text-secondary hover:bg-vibe-panel cursor-pointer' : 'text-vibe-comment cursor-default'}`}
        disabled={!hasMemory}
      >
        <span>AI's Working Memory {hasMemory ? `(${Object.keys(memory).length})` : ''}</span>
        {hasMemory && (
            <ChevronDownIcon
            className={`w-5 h-5 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''}`}
            />
        )}
      </button>
      {isOpen && hasMemory && (
        <div className="p-3 text-xs font-mono bg-vibe-bg-deep text-vibe-text max-h-48 overflow-y-auto">
          <pre className="whitespace-pre-wrap">
            {JSON.stringify(
              Object.fromEntries(
                // FIX: Cast the value to `any` to resolve a type inference issue with Object.entries,
                // where the object's property value was being incorrectly typed as `unknown`.
                Object.entries(memory).map(([key, value]) => [key, (value as any).value])
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