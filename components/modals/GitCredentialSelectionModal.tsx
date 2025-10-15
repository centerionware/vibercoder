import React from 'react';
import { GitCredential } from '../../types';
import CogIcon from '../icons/CogIcon';
import XIcon from '../icons/XIcon';

interface GitCredentialSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  credentials: GitCredential[];
  onSelect: (id: string) => void;
  onClearSelection: () => void; // For selecting "Default"
  onManageCredentials: () => void;
}

const GitCredentialSelectionModal: React.FC<GitCredentialSelectionModalProps> = ({
  isOpen,
  onClose,
  credentials,
  onSelect,
  onClearSelection,
  onManageCredentials
}) => {
  if (!isOpen) return null;

  const defaultCredential = credentials.find(c => c.isDefault);

  return (
    <div 
      className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4" // Higher z-index
      onClick={onClose}
    >
      <div 
        className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-sm flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-vibe-bg-deep">
          <h2 className="text-lg font-bold text-vibe-text">Select Credential for Clone</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-vibe-bg-deep"><XIcon className="w-5 h-5"/></button>
        </header>
        <div className="overflow-y-auto p-2 max-h-60">
            <ul className="space-y-1">
                {/* Option for default */}
                <li>
                    <button
                        onClick={onClearSelection}
                        className="w-full text-left p-3 rounded-md transition-colors text-vibe-text-secondary hover:bg-vibe-bg-deep"
                    >
                        <p className="font-semibold">Use Default</p>
                        <p className="text-xs text-vibe-comment">
                            {defaultCredential ? `(${defaultCredential.name})` : '(No default set, will attempt anonymous)'}
                        </p>
                    </button>
                </li>
                {/* List of specific credentials */}
                {credentials.map(cred => (
                    <li key={cred.id}>
                        <button
                            onClick={() => onSelect(cred.id)}
                            className="w-full text-left p-3 rounded-md transition-colors text-vibe-text-secondary hover:bg-vibe-bg-deep"
                        >
                            {cred.name}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
        <footer className="p-3 border-t border-vibe-bg-deep flex justify-center">
            <button
              onClick={onManageCredentials}
              className="w-full bg-vibe-bg-deep text-vibe-text-secondary px-4 py-2 rounded-md text-sm hover:bg-vibe-comment transition-colors flex items-center justify-center gap-2"
            >
              <CogIcon className="w-4 h-4" />
              Manage All Credentials
            </button>
        </footer>
      </div>
    </div>
  );
};

export default GitCredentialSelectionModal;