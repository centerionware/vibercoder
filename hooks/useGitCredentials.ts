import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../utils/idb';
import { GitCredential } from '../types';

export const useGitCredentials = () => {
    const [credentials, setCredentials] = useState<GitCredential[]>([]);
    
    useEffect(() => {
        const loadCredentials = async () => {
            const allCredentials = await db.gitCredentials.toArray();
            setCredentials(allCredentials);
        };
        loadCredentials();
    }, []);

    const createGitCredential = useCallback(async (name: string, token: string) => {
        if (!name.trim() || !token.trim()) return;
        
        const allCredentials = await db.gitCredentials.toArray();
        const isFirstCredential = allCredentials.length === 0;

        const newCredential: GitCredential = {
            id: uuidv4(),
            name,
            token,
            isDefault: isFirstCredential,
        };
        await db.gitCredentials.add(newCredential);
        setCredentials(prev => [...prev, newCredential]);
    }, []);

    const deleteGitCredential = useCallback(async (id: string) => {
        await db.gitCredentials.delete(id);
        setCredentials(prev => prev.filter(c => c.id !== id));
    }, []);

    const setDefaultGitCredential = useCallback(async (id: string) => {
        // Dexie transactions are great for this kind of multi-step update
        // Fix: Cast 'db' to 'any' to allow calling Dexie's 'transaction' method, resolving a TypeScript type error.
        await (db as any).transaction('rw', db.gitCredentials, async () => {
            // Unset any existing default
            await db.gitCredentials.where({ isDefault: true }).modify({ isDefault: false });
            // Set the new default
            await db.gitCredentials.update(id, { isDefault: true });
        });

        // Update local state to reflect the change
        setCredentials(prev => prev.map(c => ({
            ...c,
            isDefault: c.id === id,
        })));
    }, []);

    return {
        gitCredentials: credentials,
        createGitCredential,
        deleteGitCredential,
        setDefaultGitCredential
    };
};