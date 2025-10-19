import React from 'react';
import { ToolCall, ToolCallStatus } from '../../types';
import SpinnerIcon from '../icons/SpinnerIcon';
import CheckIcon from '../icons/CheckIcon';
import XIcon from '../icons/XIcon';
import StopCircleIcon from '../icons/StopCircleIcon';

interface ToolCallDisplayProps {
    toolCalls: ToolCall[];
    thinkingStatus: string | null | undefined;
}

const ToolCallDisplay: React.FC<ToolCallDisplayProps> = ({ toolCalls, thinkingStatus }) => {
    const hasError = toolCalls.some(tc => tc.status === ToolCallStatus.ERROR);
    const hasInProgress = toolCalls.some(tc => tc.status === ToolCallStatus.IN_PROGRESS);
    
    const headerColor = hasError ? 'text-red-400' 
        : hasInProgress ? 'text-vibe-accent' 
        : 'text-green-400';
        
    const borderColor = hasError ? 'border-red-400/30' 
        : hasInProgress ? 'border-vibe-accent/30' 
        : 'border-green-400/30';
        
    const bgColor = hasError ? 'bg-red-900/20' 
        : hasInProgress ? 'bg-vibe-accent/10' 
        : 'bg-green-900/20';

    return (
        <div className={`mt-2 border-t ${borderColor} pt-2`}>
            <header className="flex items-center text-xs w-full font-semibold">
                {hasInProgress && <SpinnerIcon className="w-4 h-4 mr-2" />}
                <span className={headerColor}>{thinkingStatus || `Tool Calls (${toolCalls.length})`}</span>
            </header>
            <div className={`mt-2 space-y-2 text-xs p-2 rounded-md ${bgColor}`}>
                {toolCalls.map(tc => (
                    <div key={tc.id} className="font-mono">
                        <div className="flex items-center gap-2">
                            {tc.status === ToolCallStatus.IN_PROGRESS && <SpinnerIcon className="w-3 h-3 flex-shrink-0 text-vibe-accent" />}
                            {tc.status === ToolCallStatus.SUCCESS && <CheckIcon className="w-3 h-3 text-green-400 flex-shrink-0" />}
                            {tc.status === ToolCallStatus.ERROR && <XIcon className="w-3 h-3 text-red-400 flex-shrink-0" />}
                            {tc.status === ToolCallStatus.CANCELLED && <StopCircleIcon className="w-3 h-3 text-yellow-400 flex-shrink-0" />}
                            <span className="truncate opacity-80" title={`${tc.name}(${JSON.stringify(tc.args)})`}>{tc.name}(...)</span>
                        </div>
                        {tc.status === ToolCallStatus.ERROR && tc.args?.errors && Array.isArray(tc.args.errors) && (
                            <pre className="mt-1.5 ml-5 text-red-300 whitespace-pre-wrap text-[11px] p-2 bg-black/20 rounded-md">
                                {tc.args.errors.join('\n')}
                            </pre>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default ToolCallDisplay;