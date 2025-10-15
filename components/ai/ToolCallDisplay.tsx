import React, { useState } from 'react';
import { ToolCall, ToolCallStatus } from '../../types';
import SpinnerIcon from '../icons/SpinnerIcon';
import CheckIcon from '../icons/CheckIcon';
import XIcon from '../icons/XIcon';
import ChevronDownIcon from '../icons/ChevronDownIcon';
import StopCircleIcon from '../icons/StopCircleIcon';

const ToolCallDisplay: React.FC<{ toolCalls: ToolCall[] }> = ({ toolCalls }) => {
    const [isOpen, setIsOpen] = useState(true);

    // Determine the overall color based on status priority: error > in_progress > cancelled > success
    const hasError = toolCalls.some(tc => tc.status === ToolCallStatus.ERROR);
    const hasInProgress = toolCalls.some(tc => tc.status === ToolCallStatus.IN_PROGRESS);
    const hasCancelled = toolCalls.some(tc => tc.status === ToolCallStatus.CANCELLED);

    const headerColor = hasError ? 'text-red-400' 
        : hasInProgress ? 'text-vibe-accent' 
        : hasCancelled ? 'text-yellow-400'
        : 'text-green-400';
        
    const borderColor = hasError ? 'border-red-400/30' 
        : hasInProgress ? 'border-vibe-accent/30' 
        : hasCancelled ? 'border-yellow-400/30'
        : 'border-green-400/30';

    const bgColor = hasError ? 'bg-red-900/20' 
        : hasInProgress ? 'bg-vibe-accent/10' 
        : hasCancelled ? 'bg-yellow-900/20'
        : 'bg-green-900/20';


    return (
        <div className={`mt-2 border-t ${borderColor} pt-2`}>
            <button onClick={() => setIsOpen(p => !p)} className="flex items-center text-xs w-full font-semibold">
                <span className={headerColor}>Tool Calls ({toolCalls.length})</span>
                <ChevronDownIcon className={`w-4 h-4 ml-auto transition-transform ${isOpen ? 'rotate-180' : ''} ${headerColor}`} />
            </button>
            {isOpen && (
                <div className={`mt-2 space-y-2 text-xs font-mono p-2 rounded-md ${bgColor}`}>
                    {toolCalls.map(tc => (
                        <div key={tc.id}>
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
            )}
        </div>
    )
}

export default ToolCallDisplay;