import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../utils/idb';
import { Prompt } from '../types';
import { defaultPrompts } from '../prompts/defaultPrompts';

export const usePrompts = () => {
    const [prompts, setPrompts] = useState<Prompt[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const loadPrompts = async () => {
            setIsLoading(true);
            const allPrompts = await db.prompts.toArray();
            setPrompts(allPrompts);
            setIsLoading(false);
        };
        loadPrompts();
    }, []);

    const createPrompt = useCallback(async (id: string, description: string, content: string) => {
        const existing = await db.prompts.get(id);
        if (existing) {
            throw new Error(`A prompt with the key "${id}" already exists.`);
        }
        const now = Date.now();
        const versionId = uuidv4();
        const newPrompt: Prompt = {
            id,
            description,
            createdAt: now,
            currentVersionId: versionId,
            versions: [{
                versionId,
                content,
                createdAt: now,
                author: 'user',
            }]
        };
        await db.prompts.add(newPrompt);
        setPrompts(prev => [...prev, newPrompt]);
    }, []);

    const updatePrompt = useCallback(async (id: string, content: string, author: 'user' | 'ai') => {
        const promptToUpdate = await db.prompts.get(id);
        if (!promptToUpdate) {
            throw new Error(`Prompt with key "${id}" not found.`);
        }

        const now = Date.now();
        const newVersionId = uuidv4();
        const newVersion = {
            versionId: newVersionId,
            content,
            createdAt: now,
            author,
        };
        
        const updatedPrompt: Prompt = {
            ...promptToUpdate,
            currentVersionId: newVersionId,
            versions: [...promptToUpdate.versions, newVersion]
        };
        
        await db.prompts.put(updatedPrompt);
        setPrompts(prev => prev.map(p => p.id === id ? updatedPrompt : p));
    }, []);
    
    const revertToVersion = useCallback(async (id: string, versionId: string) => {
        const promptToUpdate = await db.prompts.get(id);
        if (!promptToUpdate) {
            throw new Error(`Prompt with key "${id}" not found.`);
        }
        
        const versionToRevert = promptToUpdate.versions.find(v => v.versionId === versionId);
        if (!versionToRevert) {
            throw new Error(`Version ID "${versionId}" not found in prompt "${id}".`);
        }

        await updatePrompt(id, versionToRevert.content, 'user');

    }, [updatePrompt]);
    
    const deletePrompt = useCallback(async (id: string) => {
        const promptToDelete = await db.prompts.get(id);
        if (!promptToDelete) {
            throw new Error(`Prompt with key "${id}" not found.`);
        }
        await db.prompts.delete(id);
        setPrompts(prev => prev.filter(p => p.id !== id));
    }, []);

    const resetPromptsToDefaults = useCallback(async () => {
        const now = Date.now();
        const newPrompts: Prompt[] = defaultPrompts.map(dp => {
             const versionId = uuidv4();
             return {
                id: dp.id,
                description: dp.description,
                createdAt: now,
                currentVersionId: versionId,
                versions: [{
                    versionId: versionId,
                    content: dp.content,
                    createdAt: now,
                    // FIX: Changed author from 'system' to 'ai' to match PromptVersion type ('user' | 'ai').
                    author: 'ai', 
                }]
            };
        });

        // Perform transactional wipe and replace
        // FIX: Cast 'db' to 'any' to call 'transaction' method to resolve TypeScript error.
        await (db as any).transaction('rw', db.prompts, async () => {
            await db.prompts.clear();
            await db.prompts.bulkAdd(newPrompts);
        });

        setPrompts(newPrompts);
    }, []);

    return {
        prompts,
        isLoading,
        createPrompt,
        updatePrompt,
        revertToVersion,
        deletePrompt,
        resetPromptsToDefaults,
    };
};