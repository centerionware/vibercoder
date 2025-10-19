import React from 'react';
import { AiMessage } from '../../types';
import ToolCallDisplay from './ToolCallDisplay';
import ThinkingDisplay from './ThinkingDisplay';

const ChatMessage: React.FC<{ message: AiMessage }> = ({ message }) => {
    const isModel = message.role === 'model';
    
    const isWorking = !!message.thinking || !!message.isLive;
    const pulseClass = isWorking 
      ? 'ring-2 ring-vibe-accent-hover ring-offset-2 ring-offset-vibe-bg-deep animate-pulse' 
      : '';

    return (
      <div className={`flex w-full ${isModel ? 'justify-start' : 'justify-end'}`}>
        <div 
            className={`max-w-3xl p-3 rounded-lg transition-all ${isModel ? 'bg-vibe-panel' : 'bg-vibe-accent text-white'} ${pulseClass}`}
        >
          {/* Main content */}
          <div 
            className={`prose prose-sm prose-invert ${isModel ? '' : 'prose-p:text-white prose-strong:text-white'}`}
            dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br />') || (message.thinkingContent || (message.toolCalls && message.toolCalls.length > 0) ? '' : '&nbsp;') }} 
          />
          
          {/* Collapsible Thinking/Log Section */}
          {message.thinkingContent && (
             <ThinkingDisplay content={message.thinkingContent} />
          )}
          
          {/* Always-visible Tool Call Section */}
          {(message.toolCalls && message.toolCalls.length > 0) && (
            <ToolCallDisplay 
              toolCalls={message.toolCalls} 
              thinkingStatus={message.thinking}
            />
          )}
           
           {/* Attachments */}
           {message.attachments?.map((att, i) => (
             <div key={i} className="mt-2">
               {att.type === 'image' && <img src={`data:image/jpeg;base64,${att.data}`} alt="Generated" className="rounded-md max-w-xs"/>}
               {att.type === 'video' && <video src={att.data} controls className="rounded-md max-w-xs"/>}
             </div>
           ))}

          {/* Token Count */}
          {message.tokenCount && message.tokenCount > 0 && (
            <div className="mt-2 text-right text-xs text-vibe-comment">
              Tokens used: {message.tokenCount}
            </div>
          )}
        </div>
      </div>
    );
};

export default React.memo(ChatMessage);