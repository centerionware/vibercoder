import React, { useState, useRef, useEffect } from 'react';
import ChevronDownIcon from '../icons/ChevronDownIcon';
import TrashIcon from '../icons/TrashIcon';

interface BuildLogDisplayProps {
  logs: string[];
  error: string | null;
  onClear: () => void;
}

const BuildLogDisplay: React.FC<BuildLogDisplayProps> = ({ logs, error, onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, error, isOpen]);
  
  // Automatically open the panel if a build error occurs
  useEffect(() => {
    if (error) {
      setIsOpen(true);
    }
  }, [error]);

  const hasContent = logs.length > 0 || error;

  return (
    <div className={`flex-shrink-0 border-t ${error ? 'border-red-500/30' : 'border-vibe-panel'} bg-vibe-bg-deep`}>
      <header className="flex items-center justify-between p-2 cursor-pointer hover:bg-vibe-panel/50" onClick={() => setIsOpen(p => !p)}>
        <div className="flex items-center font-semibold text-sm">
          <ChevronDownIcon className={`w-5 h-5 mr-2 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
          <span className={error ? 'text-red-400' : 'text-vibe-text-secondary'}>
            {error ? 'Build Failed' : 'Build Output'}
          </span>
        </div>
        {isOpen && (
            <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="p-1.5 rounded-md text-vibe-comment hover:bg-vibe-bg hover:text-red-400" title="Clear logs">
                <TrashIcon className="w-4 h-4" />
            </button>
        )}
      </header>
      {isOpen && (
        <div className="overflow-auto max-h-48 bg-vibe-bg-deep border-t border-vibe-panel">
            {hasContent ? (
                <pre className="p-2 font-mono text-xs whitespace-pre-wrap">
                    {logs.map((log, i) => <div key={i}>{log}</div>)}
                    {error && <div className="text-red-400 mt-2">{error}</div>}
                    <div ref={logsEndRef} />
                </pre>
            ) : (
                <div className="p-4 text-center text-vibe-comment text-sm">No build logs for this session.</div>
            )}
        </div>
      )}
    </div>
  );
};

export default BuildLogDisplay;
