import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../utils/idb';
import { Project, GitSettings } from '../types';
import { useSettings } from './useSettings';
import { safeLocalStorage } from '../utils/environment';

const ACTIVE_PROJECT_ID_KEY = 'aide_activeProjectId';

export const useProjects = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(() => safeLocalStorage.getItem(ACTIVE_PROJECT_ID_KEY));
    const { settings } = useSettings();

    const activeProject = projects.find(p => p.id === activeProjectId);

    const createNewProject = useCallback(async (name: string, setActive: boolean = true, remoteUrl: string = '', gitSettings?: GitSettings): Promise<Project> => {
        const newProject: Project = {
            id: uuidv4(),
            name,
            entryPoint: 'index.tsx',
            gitRemoteUrl: remoteUrl,
            createdAt: Date.now(),
            gitSettings: gitSettings || {
                source: 'global' // Default to using global settings
            }
        };
        await db.projects.add(newProject);
        setProjects(prev => [...prev, newProject]);
        if (setActive) {
            setActiveProjectId(newProject.id);
        }
        return newProject;
    }, []);

    useEffect(() => {
        const loadProjects = async () => {
            const allProjects = await db.projects.toArray();
            setProjects(allProjects);
            if (!activeProjectId && allProjects.length > 0) {
                setActiveProjectId(allProjects.sort((a,b) => b.createdAt - a.createdAt)[0].id);
            } else if (allProjects.length === 0) {
                // If DB is empty, create a default project
                createNewProject('My First Project', true);
            }
        };
        loadProjects();
    }, [activeProjectId, createNewProject]);

    useEffect(() => {
        if (activeProjectId) {
            safeLocalStorage.setItem(ACTIVE_PROJECT_ID_KEY, activeProjectId);
        }
    }, [activeProjectId]);

    const switchProject = useCallback((id: string) => {
        setActiveProjectId(id);
    }, []);

    const deleteProject = useCallback(async (id: string) => {
        if (projects.length <= 1) {
            alert("You cannot delete the last remaining project.");
            return;
        }

        await (db as any).transaction('rw', db.projects, db.projectFiles, db.threads, db.vfsSessions, async () => {
            // Find threads of the project to delete their VFS sessions
            const threadsToDelete = await db.threads.where({ projectId: id }).toArray();
            const threadIdsToDelete = threadsToDelete.map(t => t.id);
            
            if (threadIdsToDelete.length > 0) {
                await db.vfsSessions.where('threadId').anyOf(threadIdsToDelete).delete();
            }
            await db.threads.where({ projectId: id }).delete();
            await db.projectFiles.where({ projectId: id }).delete();
            await db.projects.delete(id);
        });

        const remaining = projects.filter(p => p.id !== id);
        setProjects(remaining);
        if (activeProjectId === id) {
            const newActiveProject = remaining.sort((a, b) => b.createdAt - a.createdAt)[0];
            setActiveProjectId(newActiveProject?.id || null);
        }
    }, [projects, activeProjectId]);
    
    const updateProject = useCallback(async (project: Project) => {
        await db.projects.put(project);
        setProjects(prev => prev.map(p => p.id === project.id ? project : p));
    }, []);

    return { projects, activeProject, activeProjectId, createNewProject, switchProject, deleteProject, updateProject };
};