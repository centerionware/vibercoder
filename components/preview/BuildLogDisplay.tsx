import React, { useState, useRef, useEffect } from 'react';
import ChevronDownIcon from '../icons/ChevronDownIcon';
import TrashIcon from '../icons/TrashIcon';

interface BuildLogDisplayProps {
  logs: string[];
  error: string | null;
  onClear: () => void;
}

const BuildLogDisplay: React.FC<BuildLogDisplayProps> = ({ logs, error, onClear }) => {
  const [isOpen, setIsOpen] = useState(true);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, error, isOpen]);

  const hasContent = logs.length > 0 || error;
  if (!hasContent) {
    return null;
  }

  const headerColor = error ? 'text-red-400' : 'text-vibe-text-secondary';
  const borderColor = error ? 'border-red-500/30' : 'border-vibe-panel';

  return (
    <div className={`flex-shrink-0 border-t ${borderColor} bg-vibe-bg-deep`}>
      <header className="flex items-center justify-between p-2">
        <button onClick={() => setIsOpen(!isOpen)} className="flex items-center font-semibold text-sm hover:opacity-80 transition-opacity">
          <ChevronDownIcon className={`w-5 h-5 mr-2 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
          <span className={headerColor}>
            {error ? 'Build Failed' : 'Build Output'}
          </span>
        </button>
        <button onClick={onClear} className="p-1.5 rounded-md text-vibe-comment hover:bg-vibe-bg hover:text-red-400" title="Clear logs">
          <TrashIcon className="w-4 h-4" />
        </button>
      </header>
      {isOpen && (
        <pre className="p-2 font-mono text-xs whitespace-pre-wrap overflow-auto max-h-48 bg-vibe-bg border-t border-vibe-panel">
          {logs.join('\n')}
          {error && <div className="text-red-400 mt-2">{error}</div>}
          <div ref={logsEndRef} />
        </pre>
      )}
    </div>
  );
};

export default BuildLogDisplay;
