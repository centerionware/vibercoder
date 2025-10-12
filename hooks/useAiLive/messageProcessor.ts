import { v4 as uuidv4 } from 'uuid';
import { ToolCall, ToolCallStatus } from '../../types';
import { interruptPlayback, playAudioChunk } from './playbackQueue';
import { MessageProcessorProps } from './types';

export const processLiveServerMessage = async (props: MessageProcessorProps) => {
    const {
        message, audioContextRefs, sessionRefs, setIsSpeaking,
        addMessage, updateMessage, toolImplementations, setIsAiTurn,
        requestUiUpdate, cancelUiUpdate,
    } = props;

    const isModelOutput = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data ||
                          message.serverContent?.outputTranscription?.text ||
                          message.toolCall;

    if (isModelOutput && !sessionRefs.current.isAiTurn) {
        sessionRefs.current.isAiTurn = true;
        setIsAiTurn(true);
    }

    // --- Handle Audio Output ---
    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
    if (base64Audio) {
        await playAudioChunk(base64Audio, audioContextRefs, sessionRefs, setIsSpeaking);
    }
    
    // --- Handle Transcriptions ---
    const inputTranscription = message.serverContent?.inputTranscription?.text;
    const outputTranscription = message.serverContent?.outputTranscription?.text;

    if (inputTranscription || outputTranscription) {
        if (!sessionRefs.current.liveMessageId) {
            sessionRefs.current.liveMessageId = uuidv4();
            addMessage({ id: sessionRefs.current.liveMessageId, role: 'user', content: '', isLive: true });
            addMessage({ id: `${sessionRefs.current.liveMessageId}-model`, role: 'model', content: '', isLive: true });
        }
        if (inputTranscription) {
            sessionRefs.current.currentInputTranscription += inputTranscription;
        }
        if (outputTranscription) {
            sessionRefs.current.currentOutputTranscription += outputTranscription;
        }
        requestUiUpdate();
    }

    // --- Handle Tool Calls ---
    if (message.toolCall) {
        if (!sessionRefs.current.liveMessageId) {
            sessionRefs.current.liveMessageId = uuidv4();
            addMessage({ id: sessionRefs.current.liveMessageId, role: 'user', content: '(voice input)', isLive: false });
            addMessage({ id: `${sessionRefs.current.liveMessageId}-model`, role: 'model', content: '', isLive: true });
        }

        const newToolCalls: ToolCall[] = message.toolCall.functionCalls.map((fc: any) => ({
            id: fc.id, name: fc.name, args: fc.args, status: ToolCallStatus.IN_PROGRESS,
        }));

        sessionRefs.current.currentToolCalls.push(...newToolCalls);
        requestUiUpdate();

        for (const fc of message.toolCall.functionCalls) {
            let status: ToolCallStatus;
            try {
                const toolFn = toolImplementations[fc.name!];
                if (!toolFn) throw new Error(`Tool "${fc.name}" not implemented.`);
                
                const result = await toolFn(fc.args);
                
                // Special, more robust handling for visual tools in live sessions
                if (fc.name === 'captureScreenshot' && result.base64Image) {
                    const session = await sessionRefs.current.sessionPromise;
                    if (!session) throw new Error("Live session is not available to send image.");

                    // 1. Send the image data via the dedicated media channel. This is a fire-and-forget operation.
                    session.sendRealtimeInput({
                        media: { data: result.base64Image, mimeType: 'image/png' }
                    });
                    
                    // 2. Introduce a necessary delay. This is a pragmatic workaround for a race condition
                    //    inherent in the Live API's design. Since media and tool responses are sent on
                    //    separate asynchronous channels, this delay gives the (larger) image data a
                    //    head start to be processed by the backend before the (smaller) tool response arrives,
                    //    which prevents the AI from responding before it has "seen" the new image.
                    await new Promise(resolve => setTimeout(resolve, 750));

                    // 3. Send a structured tool response that forcefully instructs the AI to use the new image.
                    const toolResponseResult = {
                        status: "Success",
                        confirmation: "A screenshot has been captured and provided as new visual context.",
                        instruction: "Analyze the new screenshot provided in this turn and describe what you see. Your analysis MUST be based exclusively on this new image."
                    };

                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: toolResponseResult } } });

                } else {
                    // Standard path for all other non-visual tools.
                    const session = await sessionRefs.current.sessionPromise;
                    if (!session) throw new Error("Live session is not available to send tool response.");
                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result } } });
                }
                
                status = ToolCallStatus.SUCCESS;

            } catch (e) {
                const error = e instanceof Error ? e.message : String(e);
                const session = await sessionRefs.current.sessionPromise;
                session?.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { error } } });
                status = ToolCallStatus.ERROR;
            }
            
            // Update UI status for the tool call
            sessionRefs.current.currentToolCalls = sessionRefs.current.currentToolCalls.map(tc =>
                tc.id === fc.id ? { ...tc, status } : tc
            );
            requestUiUpdate();
        }
    }

    // --- Handle Turn Completion ---
    if (message.serverContent?.turnComplete) {
        if (sessionRefs.current.isAiTurn) {
            sessionRefs.current.isAiTurn = false;
            setIsAiTurn(false);
        }
        
        // Before the final update, cancel any pending throttled update to prevent race conditions.
        cancelUiUpdate();

        const { liveMessageId, currentInputTranscription, currentOutputTranscription, currentToolCalls } = sessionRefs.current;
        if (liveMessageId) {
            // Perform the final, definitive update for this turn.
            updateMessage(liveMessageId, { content: currentInputTranscription, isLive: false });
            updateMessage(`${liveMessageId}-model`, { 
                content: currentOutputTranscription, 
                isLive: false,
                toolCalls: [...currentToolCalls]
            });
        }
        
        sessionRefs.current.liveMessageId = null;
        sessionRefs.current.currentInputTranscription = '';
        sessionRefs.current.currentOutputTranscription = '';
        sessionRefs.current.currentToolCalls = [];
    }

    // --- Handle Interruptions ---
    if (message.serverContent?.interrupted) {
        interruptPlayback(sessionRefs);
        setIsSpeaking(false);
    }
};