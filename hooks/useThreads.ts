import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../utils/idb';
import { ChatThread, AiMessage, GeminiContent } from '../types';

export const useThreads = () => {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

    const activeThread = threads.find(t => t.id === activeThreadId);
    
    // Load threads from IndexedDB on initial mount
    useEffect(() => {
        db?.threads.toArray().then(dbThreads => {
        if (dbThreads.length > 0) {
            setThreads(dbThreads);
            // Try to load last active thread, otherwise load the most recent one
            const lastActiveId = localStorage.getItem('vibecode_activeThreadId');
            if (lastActiveId && dbThreads.some(t => t.id === lastActiveId)) {
            setActiveThreadId(lastActiveId);
            } else {
            setActiveThreadId(dbThreads.sort((a, b) => b.createdAt - a.createdAt)[0].id);
            }
        } else {
            // No threads, create a new one
            createNewThread();
        }
        });
    }, []); // eslint-disable-line react-hooks/exhaustive-deps
    // Disabling lint because createNewThread is not memoized and would cause a loop if added.
    // It is safe to run only once.

    // Persist active thread ID
    useEffect(() => {
        if (activeThreadId) {
        localStorage.setItem('vibecode_activeThreadId', activeThreadId);
        }
    }, [activeThreadId]);

    const saveActiveThread = useCallback(async () => {
        if (activeThread && db) {
            await db.threads.put(activeThread);
        }
    }, [activeThread]);
    
    // Save thread whenever its messages/history change
    useEffect(() => {
        saveActiveThread();
    }, [activeThread?.messages, activeThread?.history, saveActiveThread]);

    const createNewThread = () => {
        const newThread: ChatThread = {
            id: uuidv4(),
            title: 'New Chat',
            createdAt: Date.now(),
            messages: [],
            history: [],
        };
        setThreads(prev => [...prev, newThread]);
        setActiveThreadId(newThread.id);
        return newThread.id;
    };

    const switchThread = (threadId: string) => {
        if (threadId !== activeThreadId) {
            setActiveThreadId(threadId);
        }
    };

    const deleteThread = async (threadId: string) => {
        await db?.threads.delete(threadId);
        const remainingThreads = threads.filter(t => t.id !== threadId);
        setThreads(remainingThreads);
        if (activeThreadId === threadId) {
            if (remainingThreads.length > 0) {
                setActiveThreadId(remainingThreads.sort((a,b) => b.createdAt - a.createdAt)[0].id);
            } else {
                createNewThread();
            }
        }
    };
    
    const updateMessage = useCallback((id: string, updates: Partial<AiMessage>) => {
        if (!activeThreadId) return;
        setThreads(prev => prev.map(thread => {
        if (thread.id !== activeThreadId) return thread;
        return {
            ...thread,
            messages: thread.messages.map(msg => msg.id === id ? { ...msg, ...updates } : msg),
        };
        }));
    }, [activeThreadId]);

    const addMessage = useCallback((message: AiMessage) => {
        if (!activeThreadId) return;
        setThreads(prev => prev.map(thread => {
            if (thread.id !== activeThreadId) return thread;
            return { ...thread, messages: [...thread.messages, message] };
        }));
    }, [activeThreadId]);
    
    const updateHistory = useCallback((newHistory: GeminiContent[]) => {
        if (!activeThreadId) return;
        setThreads(prev => prev.map(thread =>
            thread.id === activeThreadId ? { ...thread, history: newHistory } : thread
        ));
    }, [activeThreadId]);

    return {
        threads,
        activeThread,
        activeThreadId,
        createNewThread,
        switchThread,
        deleteThread,
        addMessage,
        updateMessage,
        updateHistory,
    };
};
