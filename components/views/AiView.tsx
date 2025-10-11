import React, { useState, useMemo } from 'react';
import { GoogleGenAI } from '@google/genai';
import { AiMessage, AppSettings, ChatThread } from '../../types';
import { useAiChat } from '../../hooks/useAiChat';

import AiHeader from '../ai/AiHeader';
import MessageList from '../ai/MessageList';
import ChatInput from '../ai/ChatInput';
import ChatHistoryModal from '../modals/ChatHistoryModal';
import ShortTermMemoryDisplay from '../ai/ShortTermMemoryDisplay';

interface AiViewProps {
  aiRef: React.RefObject<GoogleGenAI | null>;
  settings: AppSettings;
  threads: ChatThread[];
  activeThread: ChatThread | undefined;
  activeThreadId: string | null;
  toolImplementations: Record<string, (args: any) => Promise<any>>;
  addMessage: (message: AiMessage) => void;
  updateMessage: (id: string, updates: Partial<AiMessage>) => void;
  updateHistory: (newHistory: any[]) => void;
  createNewThread: () => string;
  switchThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  // Props from the persistent useAiLive hook
  isLive: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  startLiveSession: () => Promise<boolean>;
  stopLiveSession: () => void;
  toggleMute: () => void;
}

const AiView: React.FC<AiViewProps> = (props) => {
  const { 
    aiRef, settings, activeThread, addMessage, updateMessage, 
    updateHistory, toolImplementations 
  } = props;
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  
  const { isResponding, handleSendMessage } = useAiChat({
    aiRef,
    settings,
    activeThread,
    toolImplementations,
    addMessage,
    updateMessage,
    updateHistory,
  });

  const handleSwitchThread = (threadId: string) => {
    props.switchThread(threadId);
    setIsHistoryModalOpen(false);
  };

  const handleNewThread = () => {
    props.createNewThread();
    setIsHistoryModalOpen(false);
  };
  
  const hasMemory = activeThread && activeThread.shortTermMemory && Object.keys(activeThread.shortTermMemory).length > 0;

  return (
    <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep rounded-lg overflow-hidden">
      <AiHeader 
        isLive={props.isLive}
        isMuted={props.isMuted}
        toggleMute={props.toggleMute}
        onHistoryClick={() => setIsHistoryModalOpen(true)}
      />

      {hasMemory && <ShortTermMemoryDisplay memory={activeThread.shortTermMemory} />}

      <MessageList 
        activeThread={activeThread}
        isResponding={isResponding}
        onStartLiveSession={props.startLiveSession}
      />
      
      <ChatInput
        isLive={props.isLive}
        isResponding={isResponding}
        onSendMessage={handleSendMessage}
        onStartLiveSession={props.startLiveSession}
        onStopLiveSession={props.stopLiveSession}
      />

      <ChatHistoryModal
        isOpen={isHistoryModalOpen}
        onClose={() => setIsHistoryModalOpen(false)}
        threads={props.threads}
        activeThreadId={props.activeThreadId}
        onNewThread={handleNewThread}
        onSwitchThread={handleSwitchThread}
        onDeleteThread={props.deleteThread}
      />
    </div>
  );
};

export default AiView;