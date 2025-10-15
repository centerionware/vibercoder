import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../utils/idb';
import { ChatThread, AiMessage, GeminiContent } from '../types';
import { safeLocalStorage } from '../utils/environment';

export const useThreads = (activeProjectId: string | null) => {
    const [threads, setThreads] = useState<ChatThread[]>([]);
    const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

    const activeThread = threads.find(t => t.id === activeThreadId);
    
    // Load threads from IndexedDB on initial mount or when project changes
    useEffect(() => {
        if (!activeProjectId || !db) {
            setThreads([]);
            setActiveThreadId(null);
            return;
        };

        const loadThreads = async () => {
            const dbThreads = await db.threads.where('projectId').equals(activeProjectId).toArray();
            if (dbThreads.length > 0) {
                setThreads(dbThreads);
                // Try to load last active thread FOR THIS PROJECT, otherwise load the most recent one
                const lastActiveId = safeLocalStorage.getItem(`vibecode_activeThreadId_${activeProjectId}`);
                if (lastActiveId && dbThreads.some(t => t.id === lastActiveId)) {
                    setActiveThreadId(lastActiveId);
                } else {
                    setActiveThreadId(dbThreads.sort((a, b) => b.createdAt - a.createdAt)[0].id);
                }
            } else {
                // No threads for this project, create a new one
                setThreads([]); // Clear old threads from previous project
                
                const newThread: ChatThread = {
                    id: uuidv4(),
                    projectId: activeProjectId,
                    title: 'New Chat',
                    createdAt: Date.now(),
                    messages: [],
                    history: [],
                    shortTermMemory: {},
                };
                await db.threads.put(newThread);
                setThreads([newThread]);
                setActiveThreadId(newThread.id);
            }
        };

        loadThreads();
    }, [activeProjectId]);

    // Persist active thread ID for the specific project
    useEffect(() => {
        if (activeThreadId && activeProjectId) {
            safeLocalStorage.setItem(`vibecode_activeThreadId_${activeProjectId}`, activeThreadId);
        }
    }, [activeThreadId, activeProjectId]);

    const saveActiveThread = useCallback(async () => {
        if (activeThread && db) {
            await db.threads.put(activeThread);
        }
    }, [activeThread]);
    
    // Save thread whenever its messages/history change
    useEffect(() => {
        saveActiveThread();
    }, [activeThread?.messages, activeThread?.history, saveActiveThread]);

    const createNewThread = useCallback(() => {
        if (!activeProjectId) return '';

        const newThread: ChatThread = {
            id: uuidv4(),
            projectId: activeProjectId,
            title: 'New Chat',
            createdAt: Date.now(),
            messages: [],
            history: [],
            shortTermMemory: {},
        };
        setThreads(prev => [...prev, newThread]);
        setActiveThreadId(newThread.id);
        db?.threads.put(newThread); // Save immediately
        return newThread.id;
    }, [activeProjectId]);

    const switchThread = (threadId: string) => {
        if (threadId !== activeThreadId) {
            setActiveThreadId(threadId);
        }
    };

    const deleteThread = async (threadId: string) => {
        if (!activeProjectId) return;

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
    
    const updateThread = useCallback((threadId: string, updates: Partial<ChatThread>) => {
        setThreads(prev => prev.map(thread =>
            thread.id === threadId ? { ...thread, ...updates } : thread
        ));
    }, []);

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
        updateThread,
    };
};
