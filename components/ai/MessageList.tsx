import React, { useRef, useEffect } from 'react';
import { ChatThread } from '../../types';
import ChatMessage from './ChatMessage';

interface MessageListProps {
  activeThread: ChatThread | undefined;
  isResponding: boolean;
}

const MessageList: React.FC<MessageListProps> = ({ activeThread, isResponding }) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // A slight delay ensures the scroll happens after the new message has rendered.
    setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  }, [activeThread?.messages]);

  const hasMessages = activeThread && activeThread.messages.length > 0;

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
