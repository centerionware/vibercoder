import React, { useState } from 'react';
import { LogEntry } from '../../types';
import XIcon from '../icons/XIcon';
import ClipboardIcon from '../icons/ClipboardIcon';
import CheckIcon from '../icons/CheckIcon';
import TrashIcon from '../icons/TrashIcon';

interface DebugLogModalProps {
  isOpen: boolean;
  onClose: () => void;
  logs: LogEntry[];
  onClear: () => void;
}

const LogLine: React.FC<{ log: LogEntry }> = ({ log }) => {
  const levelColor = {
    log: 'text-vibe-text-secondary',
    info: 'text-vibe-accent',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  }[log.level];

  return (
    <div className="flex items-start gap-3 font-mono text-xs">
      <span className="text-vibe-comment">{new Date(log.timestamp).toLocaleTimeString()}</span>
      <span className={`font-bold w-12 flex-shrink-0 ${levelColor}`}>{`[${log.level.toUpperCase()}]`}</span>
      <pre className={`whitespace-pre-wrap break-all ${levelColor}`}>{log.message}</pre>
    </div>
  );
};

const DebugLogModal: React.FC<DebugLogModalProps> = ({ isOpen, onClose, logs, onClear }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    const logText = logs.map(log => 
      `[${new Date(log.timestamp).toISOString()}] [${log.level.toUpperCase()}] ${log.message}`
    ).join('\n');
    navigator.clipboard.writeText(logText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-4xl h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="flex items-center justify-between p-3 border-b border-vibe-bg-deep flex-shrink-0">
          <h2 className="text-lg font-bold text-vibe-text">Debug Log</h2>
          <div className="flex items-center gap-2">
            <button onClick={handleCopy} className="text-xs flex items-center gap-1.5 bg-vibe-bg-deep px-2 py-1 rounded-md text-vibe-text-secondary hover:bg-vibe-comment transition-colors">
              {copied ? <CheckIcon className="w-4 h-4 text-green-400"/> : <ClipboardIcon className="w-4 h-4"/>}
              {copied ? 'Copied!' : 'Copy Logs'}
            </button>
            <button onClick={onClear} className="text-xs flex items-center gap-1.5 bg-vibe-bg-deep px-2 py-1 rounded-md text-vibe-text-secondary hover:bg-vibe-comment transition-colors">
              <TrashIcon className="w-4 h-4"/>
              Clear
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-vibe-text-secondary hover:bg-vibe-bg-deep">
              <XIcon className="w-5 h-5" />
            </button>
          </div>
        </header>
        <div className="overflow-y-auto p-4 bg-vibe-bg-deep flex-1 space-y-2">
          {logs.length > 0 ? logs.map((log, i) => <LogLine key={i} log={log} />) : (
            <div className="flex h-full items-center justify-center text-vibe-comment">
              No logs captured in this session yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DebugLogModal;
