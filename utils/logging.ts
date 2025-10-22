import { LogEntry } from '../types';

// Global store for logs, accessible even if React crashes.
const globalLogs: LogEntry[] = [];
const MAX_LOGS = 500; // Prevent memory leaks in long sessions.

// Callback for React state updates.
let onNewLogCallback: ((log: LogEntry) => void) | null = null;

export const getDebugLogs = (): LogEntry[] => [...globalLogs];

export const clearDebugLogs = (): void => {
    globalLogs.length = 0;
};

export const startCapturingLogs = (onNewLog: (log: LogEntry) => void) => {
    if (onNewLogCallback) {
        // Already initialized
        return;
    }
    
    onNewLogCallback = onNewLog;

    const originalConsole = {
        log: console.log.bind(console),
        warn: console.warn.bind(console),
        error: console.error.bind(console),
        info: console.info.bind(console),
    };

    const capture = (level: LogEntry['level'], ...args: any[]) => {
        // Call the original console method first.
        originalConsole[level](...args);

        const message = args.map(arg => {
            try {
                if (arg instanceof Error) {
                    return `${arg.message}\n${arg.stack}`;
                }
                if (typeof arg === 'object' && arg !== null) {
                    return JSON.stringify(arg, (key, value) => 
                      typeof value === 'bigint' ? value.toString() : value, 2);
                }
                return String(arg);
            } catch (e) {
                return '[Unserializable object]';
            }
        }).join(' ');

        const logEntry: LogEntry = {
            timestamp: Date.now(),
            level,
            message,
        };

        globalLogs.push(logEntry);
        if (globalLogs.length > MAX_LOGS) {
            globalLogs.splice(0, globalLogs.length - MAX_LOGS);
        }
        
        if (onNewLogCallback) {
            onNewLogCallback(logEntry);
        }
    };

    console.log = (...args) => capture('log', ...args);
    console.warn = (...args) => capture('warn', ...args);
    console.error = (...args) => capture('error', ...args);
    console.info = (...args) => capture('info', ...args);

    console.log('AIDE log capturing initialized.');
};