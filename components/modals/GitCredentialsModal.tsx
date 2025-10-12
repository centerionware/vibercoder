import React, { useState } from 'react';
import { GitCredential } from '../../types';
import PlusIcon from '../icons/PlusIcon';
import TrashIcon from '../icons/TrashIcon';
import CheckIcon from '../icons/CheckIcon';

interface GitCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: GitCredential[];
  onCreate: (name: string, token: string) => void;
  onDelete: (id: string) => void;
  onSetDefault: (id: string) => void;
}

const GitCredentialsModal: React.FC<GitCredentialsModalProps> = (props) => {
  const { isOpen, onClose, credentials, onCreate, onDelete, onSetDefault } = props;
  const [newName, setNewName] = useState('');
  const [newToken, setNewToken] = useState('');

  if (!isOpen) return null;

  const handleCreate = () => {
    if (newName.trim() && newToken.trim()) {
      onCreate(newName.trim(), newToken.trim());
      setNewName('');
      setNewToken('');
    }
  };

  return (
    <div className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <header className="p-4 border-b border-vibe-bg-deep">
          <h2 className="text-xl font-bold text-vibe-text">Manage Git Credentials</h2>
        </header>
        
        <div className="overflow-y-auto p-4 space-y-4">
          {/* Credential List */}
          <div className="space-y-2">
            {credentials.length > 0 ? credentials.map(cred => (
              <div key={cred.id} className="bg-vibe-bg-deep p-3 rounded-md flex items-center justify-between">
                <div>
                  <p className="font-semibold text-vibe-text">{cred.name}</p>
                  <p className="text-xs text-vibe-comment font-mono">Token: ••••••••</p>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => onSetDefault(cred.id)} 
                    disabled={!!cred.isDefault}
                    className="text-xs flex items-center gap-1.5 bg-vibe-bg px-2 py-1 rounded-md text-vibe-text-secondary hover:bg-vibe-comment disabled:bg-green-500/30 disabled:text-green-300 disabled:cursor-default transition-colors"
                  >
                    {cred.isDefault ? <CheckIcon className="w-4 h-4"/> : null}
                    {cred.isDefault ? 'Default' : 'Set Default'}
                  </button>
                  <button onClick={() => onDelete(cred.id)} className="p-1.5 rounded-md text-vibe-comment hover:bg-red-500/20 hover:text-red-400 transition-colors" title="Delete Credential">
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )) : <p className="text-sm text-vibe-comment text-center p-4">No saved credentials.</p>}
          </div>

          {/* New Credential Form */}
          <div className="border-t border-vibe-bg-deep pt-4">
            <h3 className="text-lg font-semibold text-vibe-text-secondary mb-2">Add New Credential</h3>
            <div className="space-y-2">
              <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Credential Name (e.g., Personal GitHub)" className="w-full bg-vibe-bg p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-vibe-accent" />
              <input type="password" value={newToken} onChange={e => setNewToken(e.target.value)} placeholder="Personal Access Token (PAT)" className="w-full bg-vibe-bg p-2 rounded-md focus:outline-none focus:ring-2 focus:ring-vibe-accent" />
              <button onClick={handleCreate} className="w-full bg-vibe-accent text-white px-4 py-2 rounded-md flex items-center justify-center gap-2 hover:bg-vibe-accent-hover transition-colors">
                <PlusIcon className="w-5 h-5"/> Save Credential
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

export default GitCredentialsModal;
