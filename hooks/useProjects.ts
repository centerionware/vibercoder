import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../utils/idb';
import { Project } from '../types';
import { useSettings } from './useSettings';

const ACTIVE_PROJECT_ID_KEY = 'vibecode_activeProjectId';

export const useProjects = () => {
    const [projects, setProjects] = useState<Project[]>([]);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(localStorage.getItem(ACTIVE_PROJECT_ID_KEY));
    const { settings } = useSettings();

    const activeProject = projects.find(p => p.id === activeProjectId);

    useEffect(() => {
        const loadProjects = async () => {
            const allProjects = await db.projects.toArray();
            setProjects(allProjects);
            if (!activeProjectId && allProjects.length > 0) {
                setActiveProjectId(allProjects[0].id);
            } else if (allProjects.length === 0) {
                // If DB is empty, create a default project
                createNewProject('My First Project', true);
            }
        };
        loadProjects();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        if (activeProjectId) {
            localStorage.setItem(ACTIVE_PROJECT_ID_KEY, activeProjectId);
        }
    }, [activeProjectId]);

    const createNewProject = useCallback(async (name: string, setActive: boolean = true) => {
        const newProject: Project = {
            id: uuidv4(),
            name,
            entryPoint: 'index.tsx',
            gitRemoteUrl: '',
            createdAt: Date.now(),
            gitSettings: {
                source: 'global' // Default to using global settings
            }
        };
        await db.projects.add(newProject);
        setProjects(prev => [...prev, newProject]);
        if (setActive) {
            setActiveProjectId(newProject.id);
        }
    }, []);

    const switchProject = (id: string) => {
        setActiveProjectId(id);
    };

    const deleteProject = async (id: string) => {
        if (projects.length <= 1) {
            alert("You cannot delete the last remaining project.");
            return;
        }
        await db.projects.delete(id);
        const remaining = projects.filter(p => p.id !== id);
        setProjects(remaining);
        if (activeProjectId === id) {
            setActiveProjectId(remaining[0]?.id || null);
        }
    };
    
    const updateProject = async (project: Project) => {
        await db.projects.put(project);
        setProjects(prev => prev.map(p => p.id === project.id ? project : p));
    };

    return { projects, activeProject, activeProjectId, createNewProject, switchProject, deleteProject, updateProject };
};
