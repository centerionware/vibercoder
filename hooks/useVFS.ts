import { useState, useCallback, useRef } from 'react';
import { AiVirtualFileSystem, ChatThread, DELETED_FILE_SENTINEL } from '../types';
import { db } from '../utils/idb';

const VFS_SESSION_TIMEOUT = 1000 * 60 * 30; // 30 minutes

export const useVFS = (activeThread: ChatThread | undefined, files: Record<string, string>, setFiles: (files: Record<string, string>) => void) => {
    const [aiVirtualFiles, setAiVirtualFiles] = useState<AiVirtualFileSystem | null>(null);
    const vfsReadyPromiseRef = useRef<Promise<void>>(Promise.resolve());
    let vfsReadyResolverRef = useRef<() => void>(() => {});

    const initVfsSession = useCallback(async () => {
        if (!activeThread?.id) return;
        
        vfsReadyPromiseRef.current = new Promise(resolve => { vfsReadyResolverRef.current = resolve; });

        const session = await db.vfsSessions.get(activeThread.id);
        if (session && Date.now() - session.lastUpdatedAt < VFS_SESSION_TIMEOUT) {
            setAiVirtualFiles(session.data);
        } else {
            setAiVirtualFiles({ originalFiles: { ...files }, mutations: {} });
        }
        vfsReadyResolverRef.current();
    }, [activeThread?.id, files]);

    const saveVfsSession = useCallback(async () => {
        if (!activeThread?.id || !aiVirtualFiles) return;
        await db.vfsSessions.put({ threadId: activeThread.id, lastUpdatedAt: Date.now(), data: aiVirtualFiles });
    }, [activeThread?.id, aiVirtualFiles]);

    const deleteVfsSession = useCallback(async () => {
        if (!activeThread?.id) return;
        await db.vfsSessions.delete(activeThread.id);
        setAiVirtualFiles(null);
    }, [activeThread?.id]);

    const onCommitAiToHead = useCallback(() => {
        if (!aiVirtualFiles) {
            console.warn("onCommitAiToHead called but no VFS session is active.");
            return;
        }

        // 1. Apply mutations to get the new file state
        const newFiles = { ...aiVirtualFiles.originalFiles };
        for (const [filepath, mutation] of Object.entries(aiVirtualFiles.mutations)) {
            if (mutation === DELETED_FILE_SENTINEL) {
                delete newFiles[filepath];
            } else {
                newFiles[filepath] = mutation as string;
            }
        }
        
        // 2. Update the main application state
        setFiles(newFiles);

        // 3. Reset the in-memory VFS to a clean state with the new baseline
        // This allows the AI to continue working in the same turn if needed.
        setAiVirtualFiles({
            originalFiles: { ...newFiles },
            mutations: {},
        });

        // 4. Delete the now-stale VFS session from IndexedDB.
        if (activeThread?.id) {
            db.vfsSessions.delete(activeThread.id);
        }
    }, [aiVirtualFiles, setFiles, activeThread?.id]);


    return {
        aiVirtualFiles, setAiVirtualFiles,
        vfsReadyPromiseRef,
        initVfsSession,
        saveVfsSession,
        deleteVfsSession,
        onCommitAiToHead,
    };
};