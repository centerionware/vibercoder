import React, { useState } from 'react';
import SendIcon from '../icons/SendIcon';
import SpinnerIcon from '../icons/SpinnerIcon';
import MicrophoneIcon from '../icons/MicrophoneIcon';
import StopCircleIcon from '../icons/StopCircleIcon'; // A new icon for stopping

interface ChatInputProps {
  isResponding: boolean;
  isLive: boolean;
  onSendMessage: (prompt: string) => void;
  onStartLiveSession: () => Promise<any>;
  onStopLiveSession: () => void;
}

const ChatInput: React.FC<ChatInputProps> = ({ 
    isResponding, 
    isLive, 
    onSendMessage,
    onStartLiveSession,
    onStopLiveSession
}) => {
  const [prompt, setPrompt] = useState('');
  const [isStarting, setIsStarting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (prompt.trim() && !isResponding && !isLive) {
      onSendMessage(prompt.trim());
      setPrompt('');
    }
  };
  
  const handleStart = async () => {
    if (isStarting || isLive) return;
    setIsStarting(true);
    await onStartLiveSession();
    // isLive prop will update from parent, this just tracks the async call
    setIsStarting(false); 
  };

  return (
    <div className="p-3 border-t border-vibe-panel flex-shrink-0">
      <form onSubmit={handleSubmit} className="relative flex items-center gap-2">
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          placeholder={
            isLive ? "Voice chat is active..." 
            : isStarting ? "Starting voice chat..."
            : isResponding ? "AI is thinking..."
            : "Ask the AI to do something..."
          }
          rows={1}
          className="flex-1 w-full bg-vibe-panel p-3 pr-24 rounded-lg text-vibe-text resize-none focus:outline-none focus:ring-2 focus:ring-vibe-accent disabled:opacity-50"
          disabled={isResponding || isLive || isStarting}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
            <button
                type="submit"
                className="p-2 rounded-full text-vibe-text-secondary hover:bg-vibe-accent hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!prompt.trim() || isResponding || isLive}
                aria-label="Send message"
            >
                {isResponding ? <SpinnerIcon className="w-5 h-5" /> : <SendIcon className="w-5 h-5" />}
            </button>
            <div className="w-px h-6 bg-vibe-comment/50"></div>
            {isLive ? (
                <button
                    type="button"
                    onClick={onStopLiveSession}
                    className="p-2 rounded-full text-red-400 hover:bg-red-500/20 transition-colors"
                    aria-label="Stop voice session"
                >
                    <StopCircleIcon className="w-5 h-5" />
                </button>
            ) : (
                <button
                    type="button"
                    onClick={handleStart}
                    className="p-2 rounded-full text-vibe-text-secondary hover:bg-vibe-accent hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={isResponding || isStarting}
                    aria-label="Start voice session"
                >
                    {isStarting ? <SpinnerIcon className="w-5 h-5" /> : <MicrophoneIcon className="w-5 h-5" />}
                </button>
            )}
        </div>
      </form>
    </div>
  );
};


// Simple Stop Icon for the input bar
const StopCircleIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" {...props}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm-2-9h4v4h-4z"></path>
    </svg>
);

export default ChatInput;