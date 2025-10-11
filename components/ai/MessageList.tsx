import React, { useRef, useEffect, useState } from 'react';
import { ChatThread } from '../../types';
import ChatMessage from './ChatMessage';
import MicrophoneIcon from '../icons/MicrophoneIcon';
import SpinnerIcon from '../icons/SpinnerIcon';

interface MessageListProps {
  activeThread: ChatThread | undefined;
  isResponding: boolean;
  onStartLiveSession: () => Promise<any>;
}

const MessageList: React.FC<MessageListProps> = ({ activeThread, isResponding, onStartLiveSession }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isStarting, setIsStarting] = useState(false);

  useEffect(() => {
    // A slight delay ensures the scroll happens after the new message has rendered.
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [activeThread?.messages]);

  const handleStart = async () => {
    if (isStarting) return;
    setIsStarting(true);
    await onStartLiveSession();
    setIsStarting(false);
  };

  const hasMessages = activeThread && activeThread.messages.length > 0;

  if (!hasMessages && !isResponding) {
    return (
      <div className="flex flex-col h-full items-center justify-center text-center text-vibe-comment">
        <button
          onClick={handleStart}
          disabled={isStarting}
          className="w-40 h-40 rounded-full bg-vibe-panel border-4 border-vibe-comment/30 flex items-center justify-center text-vibe-comment hover:text-vibe-accent hover:border-vibe-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-wait"
          aria-label="Start voice session"
        >
          {isStarting ? (
            <SpinnerIcon className="w-20 h-20" />
          ) : (
            <MicrophoneIcon className="w-20 h-20" />
          )}
        </button>
        <p className="mt-6 font-semibold">Press the mic to start a voice chat</p>
        <p className="text-sm">or type your request below.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {hasMessages ? (
        activeThread.messages.map(msg => <ChatMessage key={msg.id} message={msg} />)
      ) : (
        <div className="flex h-full items-center justify-center">
            <p className="text-vibe-comment">No messages yet. Start the conversation!</p>
        </div>
      )}
      
      {isResponding && !hasMessages && (
        <ChatMessage message={{id: 'thinking', role: 'model', content: '', thinking: 'Thinking...'}}/>
      )}

      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;