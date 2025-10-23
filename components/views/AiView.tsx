// FIX: Recreated the content for the `AiView` component. This file was missing, causing build errors. The new content renders the complete AI chat interface, including the header, message list, input, and history modal, connecting props from the main app logic.
import React from 'react';
import { ChatThread } from '../../types';
import AiHeader from '../ai/AiHeader';
import MessageList from '../ai/MessageList';
import ChatInput from '../ai/ChatInput';
import ShortTermMemoryDisplay from '../ai/ShortTermMemoryDisplay';
import ChatHistoryModal from '../modals/ChatHistoryModal';

interface AiViewProps {
  // Chat state
  activeThread: ChatThread | undefined;
  isResponding: boolean;
  onSend: (message: string) => void;

  // Live session state and controls
  isLive: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  isAiTurn: boolean;
  isWakeWordEnabled: boolean;
  onStartLiveSession: () => Promise<boolean>;
  onStopLiveSession: () => void;
  onToggleMute: () => void;
  
  // Thread management
  isHistoryOpen: boolean;
  onOpenHistory: () => void;
  onCloseHistory: () => void;
  threads: ChatThread[];
  activeThreadId: string | null;
  onNewThread: () => void;
  onSwitchThread: (id: string) => void;
  onDeleteThread: (id: string) => void;
}

const AiView: React.FC<AiViewProps> = (props) => {
  const {
    activeThread,
    isResponding,
    onSend,
    isLive,
    isMuted,
    isSpeaking,
    isAiTurn,
    onStartLiveSession,
    onStopLiveSession,
    onToggleMute,
    isHistoryOpen,
    onOpenHistory,
    onCloseHistory,
    threads,
    activeThreadId,
    onNewThread,
    onSwitchThread,
    onDeleteThread,
  } = props;

  return (
    <div className="flex flex-1 flex-col h-full bg-vibe-bg-deep overflow-hidden">
      <AiHeader
        isLive={isLive}
        isMuted={isMuted}
        toggleMute={onToggleMute}
        onHistoryClick={onOpenHistory}
      />
      <div className="flex-1 flex flex-col min-h-0 relative">
        <ShortTermMemoryDisplay memory={activeThread?.shortTermMemory} />
        
        <MessageList
          activeThread={activeThread}
          isResponding={isResponding || isAiTurn}
          onStartLiveSession={onStartLiveSession}
          isLive={isLive}
        />
        
        <ChatInput
          onSend={onSend}
          isResponding={isResponding}
          isLive={isLive}
          isSpeaking={isSpeaking}
          isAiTurn={isAiTurn}
          onStartLiveSession={onStartLiveSession}
          onStopLiveSession={onStopLiveSession}
        />
      </div>

      <ChatHistoryModal
        isOpen={isHistoryOpen}
        onClose={onCloseHistory}
        threads={threads}
        activeThreadId={activeThreadId}
        onNewThread={() => { onNewThread(); onCloseHistory(); }}
        onSwitchThread={(id) => { onSwitchThread(id); onCloseHistory(); }}
        onDeleteThread={onDeleteThread}
      />
    </div>
  );
};

export default AiView;