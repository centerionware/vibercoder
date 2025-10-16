import { useState, useEffect } from 'react';
import { LogEntry } from '../types';
import { startCapturingLogs, clearDebugLogs as clearGlobalLogs } from '../utils/logging';

export const useDebug = () => {
    const [debugLogs, setDebugLogs] = useState<LogEntry[]>([]);

    useEffect(() => {
        startCapturingLogs(log => setDebugLogs(prev => [...prev, log]));
    }, []);

    const handleClearDebugLogs = () => {
        clearGlobalLogs();
        setDebugLogs([]);
    };

    return { debugLogs, handleClearDebugLogs };
};
