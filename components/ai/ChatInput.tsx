// FIX: Recreated the `ChatInput` component. This file was missing, causing build errors. The new content provides the UI for user text input, a send button, and a microphone button to start/stop live voice sessions, with appropriate disabled and loading states.
import React, { useState, useRef, useEffect, KeyboardEvent } from 'react';
import SendIcon from '../icons/SendIcon';
import MicrophoneIcon from '../icons/MicrophoneIcon';
import SpinnerIcon from '../icons/SpinnerIcon';

interface ChatInputProps {
  onSend: (message: string) => void;
  isResponding: boolean;
  isLive: boolean;
  isSpeaking: boolean;
  isAiTurn: boolean;
  onStartLiveSession: () => Promise<boolean>;
  onStopLiveSession: () => void;
}

const ChatInput: React.FC<ChatInputProps> = (props) => {
  const { onSend, isResponding, isLive, isSpeaking, isAiTurn, onStartLiveSession, onStopLiveSession } = props;
  const [inputValue, setInputValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isStartingLive, setIsStartingLive] = useState(false);

  useEffect(() => {
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [inputValue]);
  
  const handleSend = () => {
    if (inputValue.trim() && !isResponding && !isLive) {
      onSend(inputValue.trim());
      setInputValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };
  
  const handleMicClick = async () => {
    if (isLive) {
      onStopLiveSession();
    } else if (!isResponding) {
      setIsStartingLive(true);
      await onStartLiveSession();
      setIsStartingLive(false);
    }
  };

  const isMicDisabled = isResponding || isStartingLive;
  const micButtonClass = isLive 
    ? "bg-red-500/80 text-white hover:bg-red-600"
    : isMicDisabled 
      ? "bg-vibe-comment text-vibe-text-secondary cursor-not-allowed"
      : "bg-vibe-accent text-white hover:bg-vibe-accent-hover";
  
  const liveStatusColor = isAiTurn 
    ? 'border-vibe-accent' 
    : isSpeaking 
      ? 'border-green-400' 
      : 'border-vibe-comment';

  return (
    <div className={`flex-shrink-0 p-3 border-t bg-vibe-panel ${isLive ? `border-t-2 ${liveStatusColor}` : 'border-vibe-bg-deep'}`}>
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isLive ? "Voice chat is active..." : "Ask the AI to do something..."}
          rows={1}
          className="flex-1 bg-vibe-bg p-3 rounded-lg text-sm text-vibe-text resize-none focus:outline-none focus:ring-2 focus:ring-vibe-accent disabled:opacity-50"
          disabled={isLive || isResponding}
          style={{ maxHeight: '150px' }}
        />
        <button
          onClick={handleSend}
          disabled={!inputValue.trim() || isResponding || isLive}
          className="w-12 h-12 flex items-center justify-center bg-vibe-accent text-white rounded-lg hover:bg-vibe-accent-hover disabled:bg-vibe-comment disabled:cursor-not-allowed transition-colors"
          aria-label="Send message"
        >
          {isResponding ? <SpinnerIcon className="w-6 h-6" /> : <SendIcon className="w-6 h-6" />}
        </button>
        <button
          onClick={handleMicClick}
          disabled={isMicDisabled}
          className={`w-12 h-12 flex items-center justify-center rounded-lg transition-colors ${micButtonClass}`}
          aria-label={isLive ? "Stop voice session" : "Start voice session"}
        >
          {isStartingLive ? <SpinnerIcon className="w-6 h-6"/> : <MicrophoneIcon className="w-6 h-6" />}
        </button>
      </div>
    </div>
  );
};

export default ChatInput;
