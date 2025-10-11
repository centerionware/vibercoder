import React from 'react';
import { AiMessage } from '../../types';
import SpinnerIcon from '../icons/SpinnerIcon';
import ToolCallDisplay from './ToolCallDisplay';

const ChatMessage: React.FC<{ message: AiMessage }> = ({ message }) => {
    const isModel = message.role === 'model';
    
    const livePulseClass = message.isLive 
      ? 'ring-2 ring-vibe-accent-hover ring-offset-2 ring-offset-vibe-bg-deep animate-pulse' 
      : '';

    return (
      <div className={`flex w-full ${isModel ? 'justify-start' : 'justify-end'}`}>
        <div 
            className={`max-w-3xl p-3 rounded-lg transition-all ${isModel ? 'bg-vibe-panel' : 'bg-vibe-accent text-white'} ${livePulseClass}`}
        >
          {/* Using a div for content helps with prose styles and prevents markdown renderers from breaking on empty strings */}
          <div className="prose prose-sm prose-invert" dangerouslySetInnerHTML={{ __html: message.content.replace(/\n/g, '<br />') || '&nbsp;' }} />
          
           {message.thinking && (
            <div className="text-xs italic opacity-80 mt-2 flex items-center">
                <SpinnerIcon className="w-4 h-4 mr-2"/>
                {message.thinking}
            </div>
           )}

           {message.toolCalls && message.toolCalls.length > 0 && (
            <ToolCallDisplay toolCalls={message.toolCalls} />
           )}
           
           {message.attachments?.map((att, i) => (
             <div key={i} className="mt-2">
               {att.type === 'image' && <img src={`data:image/jpeg;base64,${att.data}`} alt="Generated" className="rounded-md max-w-xs"/>}
               {att.type === 'video' && <video src={att.data} controls className="rounded-md max-w-xs"/>}
             </div>
           ))}
        </div>
      </div>
    );
};

export default ChatMessage;
