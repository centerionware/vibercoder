import React, { useState, useEffect } from 'react';
import { Project, GitSettings, GitCredential, AppSettings } from '../../types';

interface ProjectSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: Project | null;
  onSave: (project: Project) => void;
  credentials: GitCredential[];
  globalSettings: AppSettings;
}

const ProjectSettingsModal: React.FC<ProjectSettingsModalProps> = (props) => {
  const { isOpen, onClose, project, onSave, credentials, globalSettings } = props;
  const [gitSettings, setGitSettings] = useState<GitSettings>(project?.gitSettings || { source: 'global' });
  const [customSettings, setCustomSettings] = useState(project?.gitSettings?.custom || {
      remoteUrl: project?.gitRemoteUrl || '',
      userName: globalSettings.gitUserName,
      userEmail: globalSettings.gitUserEmail,
      authToken: '',
      corsProxy: globalSettings.gitCorsProxy,
  });
  
  useEffect(() => {
    // Reset state when a new project is selected to edit
    if (project) {
        setGitSettings(project.gitSettings || { source: 'global' });
        setCustomSettings(project.gitSettings?.custom || {
            remoteUrl: project.gitRemoteUrl || '',
            userName: globalSettings.gitUserName,
            userEmail: globalSettings.gitUserEmail,
            authToken: '',
            corsProxy: globalSettings.gitCorsProxy,
        });
    }
  }, [project, globalSettings]);

  if (!isOpen || !project) return null;

  const handleSave = () => {
    const finalSettings = { ...gitSettings };
    if (finalSettings.source === 'custom') {
        finalSettings.custom = customSettings;
    } else {
        delete finalSettings.custom;
    }
    
    // Also update the top-level remote URL for convenience
    const updatedProject = {
        ...project,
        gitSettings: finalSettings,
        gitRemoteUrl: finalSettings.source === 'custom' ? customSettings.remoteUrl : project.gitRemoteUrl
    };
    onSave(updatedProject);
    onClose();
  };

  const defaultCredential = credentials.find(c => c.isDefault);

  return (
    <div className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-vibe-bg-deep">
          <h2 className="text-xl font-bold text-vibe-text">Project Settings: <span className="text-vibe-accent">{project.name}</span></h2>
        </header>

        <div className="overflow-y-auto p-4 space-y-6">
            <h3 className="text-lg font-semibold text-vibe-text-secondary">Git Configuration</h3>
            <div className="space-y-2">
                <label className="block text-sm font-medium text-vibe-text-secondary">Authentication Source</label>
                <select 
                    value={gitSettings.source} 
                    onChange={e => setGitSettings({ ...gitSettings, source: e.target.value as GitSettings['source']})}
                    className="w-full bg-vibe-bg p-2 rounded-md"
                >
                    <option value="global">Use Global Fallback Settings</option>
                    <option value="default" disabled={!defaultCredential}>Use Default Credential ({defaultCredential?.name || 'None set'})</option>
                    <option value="specific">Use a Specific Credential</option>
                    <option value="custom">Use Custom Settings for this Project</option>
                </select>
            </div>
            
            {gitSettings.source === 'specific' && (
                <div className="border-t border-vibe-bg-deep pt-4">
                    <label className="block text-sm font-medium text-vibe-text-secondary mb-2">Select Credential</label>
                     <select 
                        value={gitSettings.credentialId || ''} 
                        onChange={e => setGitSettings({ ...gitSettings, credentialId: e.target.value })}
                        className="w-full bg-vibe-bg p-2 rounded-md"
                    >
                        <option value="" disabled>-- Select a credential --</option>
                        {credentials.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                </div>
            )}

            {gitSettings.source === 'custom' && (
                <div className="border-t border-vibe-bg-deep pt-4 space-y-3">
                     <h4 className="text-md font-semibold text-vibe-text-secondary">Custom Project Settings</h4>
                     <div>
                        <label className="text-sm">Remote URL</label>
                        <input type="text" value={customSettings.remoteUrl} onChange={e => setCustomSettings({...customSettings, remoteUrl: e.target.value})} className="w-full bg-vibe-bg p-2 rounded-md mt-1" />
                     </div>
                     <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-sm">User Name</label>
                            <input type="text" value={customSettings.userName} onChange={e => setCustomSettings({...customSettings, userName: e.target.value})} className="w-full bg-vibe-bg p-2 rounded-md mt-1" />
                        </div>
                        <div>
                            <label className="text-sm">User Email</label>
                            <input type="email" value={customSettings.userEmail} onChange={e => setCustomSettings({...customSettings, userEmail: e.target.value})} className="w-full bg-vibe-bg p-2 rounded-md mt-1" />
                        </div>
                     </div>
                     <div>
                        <label className="text-sm">Auth Token</label>
                        <input type="password" value={customSettings.authToken} onChange={e => setCustomSettings({...customSettings, authToken: e.target.value})} className="w-full bg-vibe-bg p-2 rounded-md mt-1" />
                     </div>
                </div>
            )}

        </div>
        
        <footer className="p-3 border-t border-vibe-bg-deep flex justify-end gap-3">
          <button onClick={onClose} className="bg-vibe-bg-deep px-4 py-2 rounded-md text-sm text-vibe-text-secondary hover:bg-vibe-comment">Cancel</button>
          <button onClick={handleSave} className="bg-vibe-accent text-white px-5 py-2 rounded-md text-sm font-semibold hover:bg-vibe-accent-hover">Save Changes</button>
        </footer>
      </div>
    </div>
  );
};

export default ProjectSettingsModal;
