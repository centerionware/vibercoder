import React, { useState } from 'react';
import { Project } from '../../types';
import PlusIcon from '../icons/PlusIcon';
import TrashIcon from '../icons/TrashIcon';
import CogIcon from '../icons/CogIcon';

interface ProjectManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: Project[];
  activeProject: Project;
  onNewProject: (name: string) => void;
  onSwitchProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onOpenProjectSettings: (project: Project) => void;
  onCloneProject: (url: string, name: string) => void;
}

const ProjectManagementModal: React.FC<ProjectManagementModalProps> = (props) => {
  const { isOpen, onClose, projects, activeProject, onNewProject, onSwitchProject, onDeleteProject, onOpenProjectSettings, onCloneProject } = props;
  const [newProjectName, setNewProjectName] = useState('');
  const [cloneUrl, setCloneUrl] = useState('');
  const [cloneProjectName, setCloneProjectName] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (newProjectName.trim()) {
      onNewProject(newProjectName.trim());
      setNewProjectName('');
    }
  };

  const handleClone = () => {
      if (cloneUrl.trim() && cloneProjectName.trim()) {
          onCloneProject(cloneUrl, cloneProjectName);
          setCloneUrl('');
          setCloneProjectName('');
      }
  }

  const sortedProjects = [...projects].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-vibe-bg-deep">
          <h2 className="text-xl font-bold text-vibe-text">Manage Projects</h2>
        </header>
        
        <div className="overflow-y-auto p-4 space-y-6">
          {/* Project List */}
          <div>
            <h3 className="text-lg font-semibold text-vibe-text-secondary mb-2">Your Projects</h3>
            <ul className="space-y-2">
              {sortedProjects.map(proj => (
                <li key={proj.id} className={`group flex items-center justify-between p-3 rounded-md transition-colors ${activeProject.id === proj.id ? 'bg-vibe-accent' : 'bg-vibe-bg-deep'}`}>
                  <button onClick={() => onSwitchProject(proj.id)} className="flex-1 text-left">
                    <p className={`font-semibold ${activeProject.id === proj.id ? 'text-white' : 'text-vibe-text'}`}>{proj.name}</p>
                    <p className={`text-xs ${activeProject.id === proj.id ? 'text-white/80' : 'text-vibe-comment'}`}>{proj.id}</p>
                  </button>
                  <div className="flex items-center gap-2">
                    <button onClick={() => onOpenProjectSettings(proj)} className={`p-1.5 rounded-md transition-colors ${activeProject.id === proj.id ? 'text-white/80 hover:bg-white/20' : 'text-vibe-comment opacity-0 group-hover:opacity-100 hover:bg-vibe-panel'}`} title="Project Settings">
                        <CogIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => onDeleteProject(proj.id)} className={`p-1.5 rounded-md transition-colors ${activeProject.id === proj.id ? 'text-white/80 hover:bg-white/20' : 'text-vibe-comment opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400'}`} title="Delete Project">
                        <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {/* New Project Form */}
          <div className="border-t border-vibe-bg-deep pt-4">
            <h3 className="text-lg font-semibold text-vibe-text-secondary mb-2">Create New Project</h3>
            <div className="flex gap-2">
              <input type="text" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} placeholder="New project name" className="flex-1 bg-vibe-bg p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-vibe-accent" />
              <button onClick={handleCreate} className="bg-vibe-accent text-white px-4 py-2 rounded-md flex items-center gap-2 hover:bg-vibe-accent-hover transition-colors">
                <PlusIcon className="w-5 h-5"/> Create
              </button>
            </div>
          </div>
          
           {/* Clone Project Form */}
          <div className="border-t border-vibe-bg-deep pt-4">
            <h3 className="text-lg font-semibold text-vibe-text-secondary mb-2">Clone from Git</h3>
            <div className="space-y-2">
                <input type="text" value={cloneUrl} onChange={e => setCloneUrl(e.target.value)} placeholder="Git Repository URL" className="w-full bg-vibe-bg p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-vibe-accent" />
                <input type="text" value={cloneProjectName} onChange={e => setCloneProjectName(e.target.value)} placeholder="Local project name" className="w-full bg-vibe-bg p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-vibe-accent" />
                <button onClick={handleClone} className="w-full bg-vibe-bg-deep text-vibe-text-secondary px-4 py-2 rounded-md hover:bg-vibe-comment transition-colors">
                    Clone Project
                </button>
            </div>
          </div>

        </div>

        <footer className="p-3 border-t border-vibe-bg-deep text-right">
          <button onClick={onClose} className="bg-vibe-bg-deep px-4 py-2 rounded-md text-sm text-vibe-text-secondary hover:bg-vibe-comment transition-colors">Close</button>
        </footer>
      </div>
    </div>
  );
};

export default ProjectManagementModal;
