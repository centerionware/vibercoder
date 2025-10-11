import React from 'react';
import { ChatThread } from '../../types';
import PlusIcon from '../icons/PlusIcon';
import TrashIcon from '../icons/TrashIcon';

interface ChatHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  threads: ChatThread[];
  activeThreadId: string | null;
  onNewThread: () => void;
  onSwitchThread: (threadId: string) => void;
  onDeleteThread: (threadId: string) => void;
}

const ChatHistoryModal: React.FC<ChatHistoryModalProps> = ({
  isOpen,
  onClose,
  threads,
  activeThreadId,
  onNewThread,
  onSwitchThread,
  onDeleteThread
}) => {
  if (!isOpen) return null;

  const sortedThreads = [...threads].sort((a, b) => b.createdAt - a.createdAt);

  return (
    <div 
      className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-md max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-4 border-b border-vibe-bg-deep flex-shrink-0">
          <h2 className="text-xl font-bold text-vibe-text">Chat Threads</h2>
          <button
            onClick={onNewThread}
            className="flex items-center gap-2 bg-vibe-accent text-white px-3 py-1.5 rounded-md text-sm hover:bg-vibe-accent-hover transition-colors"
          >
            <PlusIcon className="w-5 h-5" />
            New Chat
          </button>
        </header>
        <div className="overflow-y-auto p-2">
          {sortedThreads.length > 0 ? (
            <ul className="space-y-1">
              {sortedThreads.map(thread => (
                <li key={thread.id}>
                  <div
                    className={`group w-full flex items-center justify-between text-left p-3 rounded-md transition-colors cursor-pointer ${
                      activeThreadId === thread.id
                        ? 'bg-vibe-accent text-white'
                        : 'text-vibe-text-secondary hover:bg-vibe-bg-deep'
                    }`}
                    onClick={() => onSwitchThread(thread.id)}
                  >
                    <div className="flex-1 truncate pr-2">
                        <p className="font-semibold truncate">{thread.title}</p>
                        <p className={`text-xs ${
                            activeThreadId === thread.id ? 'text-white/80' : 'text-vibe-comment'
                        }`}>
                            {new Date(thread.createdAt).toLocaleString()}
                        </p>
                    </div>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (window.confirm(`Are you sure you want to delete "${thread.title}"?`)) {
                                onDeleteThread(thread.id);
                            }
                        }}
                        className={`p-1.5 rounded-md transition-colors ${
                            activeThreadId === thread.id
                             ? 'text-white/80 hover:bg-white/20'
                             : 'text-vibe-comment opacity-0 group-hover:opacity-100 hover:bg-red-500/20 hover:text-red-400'
                        }`}
                        aria-label="Delete thread"
                    >
                        <TrashIcon className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-center text-vibe-comment">No chat history yet.</p>
          )}
        </div>
        <footer className="p-3 border-t border-vibe-bg-deep flex-shrink-0 text-right">
            <button
              onClick={onClose}
              className="bg-vibe-bg-deep px-4 py-2 rounded-md text-sm text-vibe-text-secondary hover:bg-vibe-comment transition-colors"
            >
              Close
            </button>
        </footer>
      </div>
    </div>
  );
};

export default ChatHistoryModal;
