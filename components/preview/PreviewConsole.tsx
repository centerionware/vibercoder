import React, { useState, useMemo, useRef, useEffect } from 'react';
import { PreviewLogEntry } from '../../types';
import ChevronDownIcon from '../icons/ChevronDownIcon';
import TrashIcon from '../icons/TrashIcon';
import ErrorIcon from '../icons/ErrorIcon';
import WarningIcon from '../icons/WarningIcon';
import InfoIcon from '../icons/InfoIcon';

interface PreviewConsoleProps {
  logs: PreviewLogEntry[];
  onClear: () => void;
}

const LogCountBadge: React.FC<{ icon: React.FC<any>, count: number, color: string }> = ({ icon: Icon, count, color }) => {
    if (count === 0) return null;
    return (
        <div className={`flex items-center gap-1 text-xs ${color}`}>
            <Icon className="w-4 h-4" />
            <span>{count}</span>
        </div>
    );
};

const LogLine: React.FC<{ log: PreviewLogEntry }> = React.memo(({ log }) => {
  const levelColor = {
    log: 'text-vibe-text-secondary',
    warn: 'text-yellow-400',
    error: 'text-red-400',
  }[log.type];

  const Icon = {
    log: InfoIcon,
    warn: WarningIcon,
    error: ErrorIcon,
  }[log.type];

  return (
    <div className="flex items-start gap-3 font-mono text-xs py-1 border-b border-vibe-bg">
      <span className="text-vibe-comment">{new Date(log.timestamp).toLocaleTimeString()}</span>
      <Icon className={`w-4 h-4 flex-shrink-0 mt-0.5 ${levelColor}`} />
      <pre className={`whitespace-pre-wrap break-all flex-1 ${levelColor}`}>{log.message}</pre>
    </div>
  );
});


const PreviewConsole: React.FC<PreviewConsoleProps> = ({ logs, onClear }) => {
  const [isOpen, setIsOpen] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  const { errorCount, warnCount, logCount } = useMemo(() => {
    return logs.reduce((acc, log) => {
      if (log.type === 'error') acc.errorCount++;
      else if (log.type === 'warn') acc.warnCount++;
      else acc.logCount++;
      return acc;
    }, { errorCount: 0, warnCount: 0, logCount: 0 });
  }, [logs]);

  useEffect(() => {
    if (isOpen) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isOpen]);
  
  // Open the console automatically if a new error comes in and it's closed
  useEffect(() => {
    if (errorCount > 0 && !isOpen) {
      const lastLog = logs[logs.length - 1];
      if (lastLog && lastLog.type === 'error') {
        setIsOpen(true);
      }
    }
  }, [errorCount, logs, isOpen]);

  const hasContent = logs.length > 0;

  return (
    <div className={`flex-shrink-0 border-t border-vibe-panel bg-vibe-bg-deep`}>
      <header className="flex items-center justify-between p-2 cursor-pointer hover:bg-vibe-panel/50" onClick={() => setIsOpen(!isOpen)}>
        <div className="flex items-center font-semibold text-sm">
          <ChevronDownIcon className={`w-5 h-5 mr-2 transition-transform ${isOpen ? '' : '-rotate-90'}`} />
          <span className="text-vibe-text-secondary">Console</span>
        </div>
        {!isOpen && (
            <div className="flex items-center gap-4">
                <LogCountBadge icon={ErrorIcon} count={errorCount} color="text-red-400" />
                <LogCountBadge icon={WarningIcon} count={warnCount} color="text-yellow-400" />
                <LogCountBadge icon={InfoIcon} count={logCount} color="text-vibe-text-secondary" />
            </div>
        )}
        <div className="flex items-center">
            {isOpen && (
                <button onClick={(e) => { e.stopPropagation(); onClear(); }} className="p-1.5 rounded-md text-vibe-comment hover:bg-vibe-bg hover:text-red-400" title="Clear console">
                    <TrashIcon className="w-4 h-4" />
                </button>
            )}
        </div>
      </header>
      {isOpen && (
        <div className="overflow-auto max-h-48 bg-vibe-bg-deep border-t border-vibe-panel">
            {hasContent ? (
                <div className="p-2">
                    {logs.map(log => <LogLine key={log.id} log={log} />)}
                    <div ref={logsEndRef} />
                </div>
            ) : (
                <div className="p-4 text-center text-vibe-comment text-sm">No console output.</div>
            )}
        </div>
      )}
    </div>
  );
};

export default PreviewConsole;
