import { useState, useRef, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
// FIX: Removed LiveSession and GeminiContent from @google/genai import as they are not exported.
import { GoogleGenAI, LiveServerMessage, Modality, Blob } from '@google/genai';
// FIX: Added GeminiContent to types import. It is a locally defined type.
import { AiMessage, UseAiLiveProps, ToolCallStatus, GeminiFunctionCall, ToolCall, GeminiContent } from '../types';
import { decode, createBlob, decodeAudioData } from '../utils/audio';
import { playNotificationSound } from '../utils/audio';
import { allTools, systemInstruction as baseSystemInstruction } from '../services/toolOrchestrator';

// Create a voice-specific version of the system instruction.
const liveSystemInstruction = baseSystemInstruction + `

**Voice Interaction Rules:**
- Your spoken responses should be very brief, acting as confirmations or quick updates (e.g., "Okay, creating the component now."). Your main output is through tool execution, not conversation.`;

// Constants for audio processing
const INPUT_SAMPLE_RATE = 16000;
const OUTPUT_SAMPLE_RATE = 24000;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 4096;

export const useAiLive = ({
    aiRef,
    settings,
    addMessage,
    updateMessage,
    toolImplementations,
    activeThread,
    updateHistory, // This is passed but the live API doesn't have a history object like chat.
    onPermissionError,
}: UseAiLiveProps) => {
    const [isLive, setIsLive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false); // When the model is sending audio back

    // Refs for session and audio management
    // FIX: Replaced non-exported LiveSession type with `any` for the session object.
    const sessionRef = useRef<any | null>(null);
    const sessionPromiseRef = useRef<Promise<any> | null>(null);

    // Audio context refs
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const micStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const micSourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // Audio playback queue management
    const audioQueueRef = useRef<Set<AudioBufferSourceNode>>(new Set());
    const nextStartTimeRef = useRef(0);

    // Transcription and tool call state for the current turn
    const currentInputTranscriptionRef = useRef('');
    const currentOutputTranscriptionRef = useRef('');
    const currentToolCallsRef = useRef<ToolCall[]>([]);
    const liveMessageIdRef = useRef<string | null>(null);

    // Function to gracefully stop and clean up everything
    const stopAndCleanup = useCallback(async () => {
        setIsLive(false);
        setIsMuted(false);
        setIsSpeaking(false);
        
        if (micStreamRef.current) {
            micStreamRef.current.getTracks().forEach(track => track.stop());
            micStreamRef.current = null;
        }

        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current.onaudioprocess = null;
            scriptProcessorRef.current = null;
        }
        if (micSourceNodeRef.current) {
            micSourceNodeRef.current.disconnect();
            micSourceNodeRef.current = null;
        }

        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            await inputAudioContextRef.current.close().catch(console.error);
            inputAudioContextRef.current = null;
        }
        if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
            for (const source of audioQueueRef.current.values()) {
                try { source.stop(); } catch(e) {}
            }
            audioQueueRef.current.clear();
            await outputAudioContextRef.current.close().catch(console.error);
            outputAudioContextRef.current = null;
        }
        
        if (sessionRef.current) {
            sessionRef.current.close();
            sessionRef.current = null;
        }
        sessionPromiseRef.current = null;

        liveMessageIdRef.current = null;
        nextStartTimeRef.current = 0;
        currentInputTranscriptionRef.current = '';
        currentOutputTranscriptionRef.current = '';
        currentToolCallsRef.current = [];
    }, []);

    const startLiveSession = useCallback(async (): Promise<boolean> => {
        const ai = aiRef.current;
        if (!ai || isLive) return false;

        try {
            micStreamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (e) {
            console.error("Microphone permission denied:", e);
            onPermissionError("Microphone permission was denied. Please enable it in your browser's site settings and reload the page.");
            await stopAndCleanup();
            return false;
        }

        playNotificationSound('start');
        setIsLive(true);
        
        inputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: INPUT_SAMPLE_RATE });
        outputAudioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks: {
                onopen: () => {
                    if (!micStreamRef.current || !inputAudioContextRef.current) return;
                    
                    const source = inputAudioContextRef.current.createMediaStreamSource(micStreamRef.current);
                    const scriptProcessor = inputAudioContextRef.current.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 1, 1);
                    
                    scriptProcessor.onaudioprocess = (event) => {
                        const inputData = event.inputBuffer.getChannelData(0);
                        if (!isMuted) {
                            const pcmBlob = createBlob(inputData);
                            sessionPromiseRef.current?.then((session) => {
                                session.sendRealtimeInput({ media: pcmBlob });
                            }).catch(console.error);
                        }
                    };
                    
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContextRef.current.destination);

                    micSourceNodeRef.current = source;
                    scriptProcessorRef.current = scriptProcessor;
                },
                onmessage: async (message: LiveServerMessage) => {
                    // Handle model audio output
                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio && outputAudioContextRef.current) {
                        setIsSpeaking(true);
                        const ctx = outputAudioContextRef.current;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);

                        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, OUTPUT_SAMPLE_RATE, 1);
                        const source = ctx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(ctx.destination);
                        
                        source.addEventListener('ended', () => {
                            audioQueueRef.current.delete(source);
                            if (audioQueueRef.current.size === 0) {
                                setIsSpeaking(false);
                            }
                        });
                        
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        audioQueueRef.current.add(source);
                    }
                    
                    // Handle transcriptions
                    const inputTranscription = message.serverContent?.inputTranscription?.text;
                    const outputTranscription = message.serverContent?.outputTranscription?.text;

                    if (inputTranscription || outputTranscription) {
                        if (!liveMessageIdRef.current) {
                            liveMessageIdRef.current = uuidv4();
                            addMessage({ id: liveMessageIdRef.current, role: 'user', content: '', isLive: true });
                            addMessage({ id: `${liveMessageIdRef.current}-model`, role: 'model', content: '', isLive: true });
                        }
                        if (inputTranscription) {
                            currentInputTranscriptionRef.current += inputTranscription;
                            updateMessage(liveMessageIdRef.current, { content: currentInputTranscriptionRef.current });
                        }
                        if (outputTranscription) {
                            currentOutputTranscriptionRef.current += outputTranscription;
                            updateMessage(`${liveMessageIdRef.current}-model`, { content: currentOutputTranscriptionRef.current });
                        }
                    }

                    // Handle tool calls
                    if (message.toolCall) {
                        if (!liveMessageIdRef.current) {
                            liveMessageIdRef.current = uuidv4();
                            addMessage({ id: liveMessageIdRef.current, role: 'user', content: '(voice input)', isLive: false });
                            addMessage({ id: `${liveMessageIdRef.current}-model`, role: 'model', content: '', isLive: true });
                        }
                        const modelMessageId = `${liveMessageIdRef.current}-model`;

                        const newToolCalls: ToolCall[] = message.toolCall.functionCalls.map(fc => ({
                            id: fc.id,
                            name: fc.name,
                            args: fc.args,
                            status: ToolCallStatus.IN_PROGRESS,
                        }));

                        currentToolCallsRef.current.push(...newToolCalls);
                        updateMessage(modelMessageId, { toolCalls: [...currentToolCallsRef.current] });

                        for (const fc of message.toolCall.functionCalls) {
                            const toolFn = toolImplementations[fc.name!];
                            let status: ToolCallStatus;
                            try {
                                if (!toolFn) throw new Error(`Tool "${fc.name}" not implemented.`);
                                const result = await toolFn(fc.args);
                                sessionPromiseRef.current?.then((session) => {
                                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: result } } });
                                });
                                status = ToolCallStatus.SUCCESS;
                            } catch (e) {
                                 const error = e instanceof Error ? e.message : String(e);
                                 sessionPromiseRef.current?.then((session) => {
                                    session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { error: error } } });
                                });
                                status = ToolCallStatus.ERROR;
                            }
                            currentToolCallsRef.current = currentToolCallsRef.current.map(tc =>
                                tc.id === fc.id ? { ...tc, status } : tc
                            );
                            updateMessage(modelMessageId, { toolCalls: [...currentToolCallsRef.current] });
                        }
                    }
                    
                    if (message.serverContent?.turnComplete) {
                        const finalUserInput = currentInputTranscriptionRef.current;
                        const finalModelOutput = currentOutputTranscriptionRef.current;

                        if (liveMessageIdRef.current) {
                             updateMessage(liveMessageIdRef.current, { content: finalUserInput, isLive: false });
                             updateMessage(`${liveMessageIdRef.current}-model`, { 
                                 content: finalModelOutput, 
                                 isLive: false,
                                 toolCalls: [...currentToolCallsRef.current]
                            });
                        }
                        
                        liveMessageIdRef.current = null;
                        currentInputTranscriptionRef.current = '';
                        currentOutputTranscriptionRef.current = '';
                        currentToolCallsRef.current = [];
                    }

                    if (message.serverContent?.interrupted) {
                        for (const source of audioQueueRef.current.values()) {
                            try { source.stop(); } catch(e) {}
                        }
                        audioQueueRef.current.clear();
                        nextStartTimeRef.current = 0;
                        setIsSpeaking(false);
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Live session error:', e);
                    onPermissionError(`An error occurred with the voice session: ${e.message || 'Unknown error'}. The session has been closed.`);
                    stopAndCleanup();
                },
                onclose: (e: CloseEvent) => {
                    // This can be triggered by server or by calling .close().
                    // The cleanup is handled by stopLiveSession or onerror.
                },
            },
            config: {
                responseModalities: [Modality.AUDIO],
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                },
                tools: [{ functionDeclarations: allTools }],
                systemInstruction: liveSystemInstruction
            },
        });

        sessionPromiseRef.current.then(session => {
            sessionRef.current = session;
        }).catch(err => {
            console.error("Failed to establish live session:", err);
            onPermissionError("Could not connect to the live AI service.");
            stopAndCleanup();
        });

        return true;
    }, [aiRef, isLive, isMuted, onPermissionError, stopAndCleanup, addMessage, updateMessage, toolImplementations]);

    const stopLiveSession = useCallback(async () => {
        playNotificationSound('stop');
        await stopAndCleanup();
    }, [stopAndCleanup]);
    
    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    useEffect(() => {
        return () => {
            // Ensure cleanup on unmount
            stopAndCleanup();
        };
    }, [stopAndCleanup]);

    return {
        isLive,
        isMuted,
        isSpeaking,
        startLiveSession,
        stopLiveSession,
        toggleMute,
    };
};