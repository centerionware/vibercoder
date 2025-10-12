import React, { useRef, useEffect, useState } from 'react';
import { ChatThread } from '../../types';
import ChatMessage from './ChatMessage';
import MicrophoneIcon from '../icons/MicrophoneIcon';
import SpinnerIcon from '../icons/SpinnerIcon';

interface MessageListProps {
  activeThread: ChatThread | undefined;
  isResponding: boolean;
  onStartLiveSession: () => Promise<any>;
  isLive: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ activeThread, isResponding, onStartLiveSession, isLive }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [showRestartButton, setShowRestartButton] = useState(false);
  const prevIsLiveRef = useRef(isLive);

  const hasMessages = activeThread && activeThread.messages.length > 0;

  useEffect(() => {
    // A slight delay ensures the scroll happens after the new message has rendered.
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [activeThread?.messages]);

  useEffect(() => {
    // Show the restart button when a live session ends and there's a conversation history.
    if (prevIsLiveRef.current && !isLive && hasMessages) {
      setShowRestartButton(true);
    }
    // Hide the restart button if a new session starts or if the AI is responding to text.
    if (isLive || isResponding) {
      setShowRestartButton(false);
    }
    prevIsLiveRef.current = isLive;
  }, [isLive, isResponding, hasMessages]);

  const handleStart = async () => {
    if (isStarting) return;
    setIsStarting(true);
    // Hide button immediately for responsiveness.
    setShowRestartButton(false); 
    await onStartLiveSession();
    setIsStarting(false);
  };

  const showInitialMic = !hasMessages && !isResponding;

  return (
    <div className="flex-1 overflow-hidden relative">
      {/* Scrollable message container */}
      <div className="absolute inset-0 overflow-y-auto p-4 space-y-4">
        {showInitialMic ? (
          <div className="flex flex-col h-full items-center justify-center text-center text-vibe-comment">
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="w-40 h-40 rounded-full bg-vibe-panel border-4 border-vibe-comment/30 flex items-center justify-center text-vibe-comment hover:text-vibe-accent hover:border-vibe-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-wait"
              aria-label="Start voice session"
            >
              {isStarting ? <SpinnerIcon className="w-20 h-20" /> : <MicrophoneIcon className="w-20 h-20" />}
            </button>
            <p className="mt-6 font-semibold">Press the mic to start a voice chat</p>
            <p className="text-sm">or type your request below.</p>
          </div>
        ) : (
          <>
            {activeThread?.messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
            {isResponding && !hasMessages && (
              <ChatMessage message={{id: 'thinking', role: 'model', content: '', thinking: 'Thinking...'}}/>
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Overlay restart button */}
      {showRestartButton && (
        <div 
            className="absolute inset-0 flex items-center justify-center bg-vibe-bg-deep/30 backdrop-blur-sm z-10"
        >
          <button
            onClick={handleStart}
            disabled={isStarting}
            className="w-40 h-40 rounded-full bg-vibe-panel/80 border-4 border-vibe-comment/50 flex items-center justify-center text-vibe-comment hover:text-vibe-accent hover:border-vibe-accent transition-all duration-300 disabled:opacity-50 disabled:cursor-wait"
            aria-label="Restart voice session"
          >
            {isStarting ? <SpinnerIcon className="w-20 h-20" /> : <MicrophoneIcon className="w-20 h-20" />}
          </button>
        </div>
      )}
    </div>
  );
};

export default MessageList;