import { useState, useRef, useCallback, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';
import { Camera } from '@capacitor/camera';
import { UseAiLiveProps, View, ToolCall, ToolCallStatus } from '../types';
import { playNotificationSound } from '../utils/audio';
import { createLiveSession } from './useAiLive/sessionManager';
import { connectMicrophoneNodes, stopAudioProcessing } from './useAiLive/audioManager';
import { AudioContextRefs, SessionRefs, LiveSession } from './useAiLive/types';
import { getPreviewState, blobToBase64 } from '../utils/preview';
import { interruptPlayback, playAudioChunk } from './useAiLive/playbackQueue';


export const useAiLive = (props: UseAiLiveProps) => {
    // --- State and Refs ---
    const [isLive, setIsLive] = useState(false);
    const [isMuted, setIsMuted] = useState(false);
    const [isSpeaking, setIsSpeaking] = useState(false);
    const [isAiTurn, setIsAiTurn] = useState(false);
    const [pendingAction, setPendingAction] = useState<'stop' | 'pause' | null>(null);
    const [pendingPauseDuration, setPendingPauseDuration] = useState<number>(0);
    const [isVideoStreamEnabled, setIsVideoStreamEnabled] = useState(false);

    const propsRef = useRef(props);
    useEffect(() => { propsRef.current = props; }, [props]);

    const stateRef = useRef({ isLive, isMuted, isSpeaking, isAiTurn, isVideoStreamEnabled });
    useEffect(() => { stateRef.current = { isLive, isMuted, isSpeaking, isAiTurn, isVideoStreamEnabled }; }, [isLive, isMuted, isSpeaking, isAiTurn, isVideoStreamEnabled]);

    const audioContextRefs = useRef<AudioContextRefs>({
        input: null, output: null, micStream: null,
        scriptProcessor: null, micSourceNode: null,
    });
    
    const sessionRefs = useRef<SessionRefs>({
        session: null, sessionPromise: null, audioQueue: new Set(),
        nextStartTime: 0, liveMessageId: null,
        currentInputTranscription: '', currentOutputTranscription: '',
        currentToolCalls: [],
        isAiTurn: false,
        pendingMessageQueue: [],
        isTurnFinalizing: false,
    });

    const uiUpdateTimerRef = useRef<number | null>(null);
    const previousVoiceNameRef = useRef(props.settings.voiceName);
    const streamIntervalRef = useRef<number | null>(null);
    const autoDisableVideoTimeoutRef = useRef<number | null>(null);
    const endOfTurnTimerRef = useRef<number | null>(null);


    // --- Core Logic Implementations ---
    const requestUiUpdate = useCallback(() => {
        if (uiUpdateTimerRef.current) return;
    
        uiUpdateTimerRef.current = window.setTimeout(() => {
            const { liveMessageId, currentInputTranscription, currentOutputTranscription, currentToolCalls } = sessionRefs.current;
            
            if (liveMessageId) {
                propsRef.current.updateMessage(liveMessageId, { content: currentInputTranscription });
                propsRef.current.updateMessage(`${liveMessageId}-model`, { 
                    content: currentOutputTranscription,
                    toolCalls: [...currentToolCalls] 
                });
            }
            
            uiUpdateTimerRef.current = null;
        }, 100);
    }, []);

    const cancelUiUpdate = useCallback(() => {
        if (uiUpdateTimerRef.current) {
            clearTimeout(uiUpdateTimerRef.current);
            uiUpdateTimerRef.current = null;
        }
    }, []);

    const processModelOutput = useCallback(async (message: any) => {
        const { addMessage, updateMessage, toolImplementations } = propsRef.current;
    
        if (message.serverContent && !sessionRefs.current.isAiTurn) {
            sessionRefs.current.isAiTurn = true;
            setIsAiTurn(true);
        }
    
        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio) {
            await playAudioChunk(base64Audio, audioContextRefs, sessionRefs, setIsSpeaking);
        }
        
        const outputTranscription = message.serverContent?.outputTranscription?.text;
        if (outputTranscription) {
            if (!sessionRefs.current.liveMessageId) {
                sessionRefs.current.liveMessageId = uuidv4();
                addMessage({ id: sessionRefs.current.liveMessageId, role: 'user', content: '', isLive: true });
                addMessage({ id: `${sessionRefs.current.liveMessageId}-model`, role: 'model', content: '', isLive: true });
            }
            sessionRefs.current.currentOutputTranscription += outputTranscription;
            requestUiUpdate();
        }
    
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
                    
                    if (fc.name === 'captureScreenshot' && result.base64Image) {
                        const session = await sessionRefs.current.sessionPromise;
                        if (!session) throw new Error("Live session is not available to send image.");
                        session.sendRealtimeInput({ media: { data: result.base64Image, mimeType: 'image/png' } });
                        await new Promise(resolve => setTimeout(resolve, 750));
                        const toolResponseResult = {
                            status: "Success",
                            confirmation: "A screenshot has been captured and provided as new visual context.",
                            instruction: "Analyze the new screenshot provided in this turn and describe what you see. Your analysis MUST be based exclusively on this new image."
                        };
                        session.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: toolResponseResult } } });
                    } else {
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
                
                sessionRefs.current.currentToolCalls = sessionRefs.current.currentToolCalls.map(tc =>
                    tc.id === fc.id ? { ...tc, status } : tc
                );
                requestUiUpdate();
            }
        }
    
        if (message.serverContent?.interrupted) {
            interruptPlayback(sessionRefs);
            setIsSpeaking(false);
        }
    }, [requestUiUpdate]);

    const processInputTranscription = useCallback((message: any) => {
        if (!sessionRefs.current.liveMessageId) {
            sessionRefs.current.liveMessageId = uuidv4();
            propsRef.current.addMessage({ id: sessionRefs.current.liveMessageId, role: 'user', content: '', isLive: true });
            propsRef.current.addMessage({ id: `${sessionRefs.current.liveMessageId}-model`, role: 'model', content: '', isLive: true });
        }
        sessionRefs.current.currentInputTranscription += message.serverContent.inputTranscription.text;
        requestUiUpdate();
    }, [requestUiUpdate]);

    const finalizeTurn = useCallback(() => {
        console.log("Finalizing turn, processing message queue.");
        sessionRefs.current.isTurnFinalizing = false;
        endOfTurnTimerRef.current = null;
    
        const queue = [...sessionRefs.current.pendingMessageQueue];
        sessionRefs.current.pendingMessageQueue = [];
    
        queue.forEach(msg => processModelOutput(msg));
        
        if (sessionRefs.current.isAiTurn) {
            sessionRefs.current.isAiTurn = false;
            setIsAiTurn(false);
        }
        
        cancelUiUpdate();
        const { liveMessageId, currentInputTranscription, currentOutputTranscription, currentToolCalls } = sessionRefs.current;
        if (liveMessageId) {
            propsRef.current.updateMessage(liveMessageId, { content: currentInputTranscription, isLive: false });
            propsRef.current.updateMessage(`${liveMessageId}-model`, { 
                content: currentOutputTranscription, 
                isLive: false,
                toolCalls: [...currentToolCalls]
            });
        }
        sessionRefs.current.liveMessageId = null;
        sessionRefs.current.currentInputTranscription = '';
        sessionRefs.current.currentOutputTranscription = '';
        sessionRefs.current.currentToolCalls = [];
    }, [processModelOutput, cancelUiUpdate, setIsAiTurn]);


    const onMessage = useCallback((message: any) => {
        if (message.serverContent?.inputTranscription) {
            if (endOfTurnTimerRef.current) {
                clearTimeout(endOfTurnTimerRef.current);
                endOfTurnTimerRef.current = null;
            }
            sessionRefs.current.isTurnFinalizing = false;
            if (sessionRefs.current.pendingMessageQueue.length > 0) {
                console.log("User interrupted; discarding premature AI response.");
                sessionRefs.current.pendingMessageQueue = [];
                interruptPlayback(sessionRefs);
                setIsSpeaking(false);
            }
            processInputTranscription(message);
            return;
        }
    
        if (message.serverContent?.turnComplete) {
            if (!sessionRefs.current.isTurnFinalizing) {
                console.log("turnComplete received. Starting 1s cooldown timer.");
                sessionRefs.current.isTurnFinalizing = true;
                endOfTurnTimerRef.current = window.setTimeout(finalizeTurn, 1000);
            }
            return;
        }
        
        if (sessionRefs.current.isTurnFinalizing) {
            sessionRefs.current.pendingMessageQueue.push(message);
        } else {
            processModelOutput(message);
        }
    }, [processInputTranscription, processModelOutput, finalizeTurn]);
    
    const captureAndStreamFrame = useCallback(async (sessionPromise: Promise<LiveSession>) => {
        try {
            const captureTarget = document.getElementById('app-container');
            if (!captureTarget) return;

            const { activeView } = propsRef.current;
            const previewState = activeView === View.Preview ? await getPreviewState() : null;

            const sourceCanvas = await html2canvas(captureTarget, {
                useCORS: true, logging: false, allowTaint: true,
                onclone: (clonedDoc) => {
                    if (clonedDoc && previewState?.htmlContent) {
                         const clonedIframe = clonedDoc.querySelector('#preview-iframe') as HTMLIFrameElement | null;
                         if(clonedIframe) {
                            const rect = clonedIframe.getBoundingClientRect();
                            const replacementDiv = clonedDoc.createElement('div');
                            replacementDiv.style.width = `${rect.width}px`;
                            replacementDiv.style.height = `${rect.height}px`;
                            const shadow = replacementDiv.attachShadow({ mode: 'open' });
                            shadow.innerHTML = previewState.htmlContent;
                             if (previewState.videoFrameDataUrl && previewState.videoFrameRect) {
                                const videoEl = shadow.querySelector('video');
                                if (videoEl) {
                                    const img = clonedDoc.createElement('img');
                                    img.src = previewState.videoFrameDataUrl;
                                    const wrapper = clonedDoc.createElement('div');
                                    wrapper.style.position = 'relative';
                                    videoEl.parentNode?.insertBefore(wrapper, videoEl);
                                    img.style.position = 'absolute';
                                    img.style.left = `${previewState.videoFrameRect.left}px`;
                                    img.style.top = `${previewState.videoFrameRect.top}px`;
                                    img.style.width = `${previewState.videoFrameRect.width}px`;
                                    img.style.height = `${previewState.videoFrameRect.height}px`;
                                    wrapper.appendChild(img);
                                    videoEl.style.visibility = 'hidden';
                                }
                            }
                            clonedIframe.parentNode?.replaceChild(replacementDiv, clonedIframe);
                         }
                    }
                }
            });
            
            const targetCanvas = document.createElement('canvas');
            targetCanvas.width = 768;
            targetCanvas.height = 768;
            const ctx = targetCanvas.getContext('2d');
            if (!ctx) return;
            
            ctx.fillStyle = '#1a1b26';
            ctx.fillRect(0, 0, 768, 768);

            const ratio = Math.min(768 / sourceCanvas.width, 768 / sourceCanvas.height);
            const width = sourceCanvas.width * ratio;
            const height = sourceCanvas.height * ratio;
            const x = (768 - width) / 2;
            const y = (768 - height) / 2;
            ctx.drawImage(sourceCanvas, x, y, width, height);
            
            const dataUrl = targetCanvas.toDataURL('image/jpeg', 0.8);
            propsRef.current.setLiveFrameData(dataUrl);

            targetCanvas.toBlob(async (blob) => {
                if (blob) {
                    const base64Data = await blobToBase64(blob);
                    const session = await sessionPromise;
                    session.sendRealtimeInput({ media: { data: base64Data, mimeType: 'image/jpeg' } });
                }
            }, 'image/jpeg', 0.8);

        } catch (error) {
            console.warn("Failed to capture and stream frame:", error);
        }
    }, []);

    const disableVideoStream = useCallback(() => {
        console.log("Disabling video stream.");
        propsRef.current.setLiveFrameData(null);
        setIsVideoStreamEnabled(false);
        if (streamIntervalRef.current) {
            clearInterval(streamIntervalRef.current);
            streamIntervalRef.current = null;
        }
        if (autoDisableVideoTimeoutRef.current) {
            clearTimeout(autoDisableVideoTimeoutRef.current);
            autoDisableVideoTimeoutRef.current = null;
        }
    }, []);

    const performStop = useCallback(async (options: { isUnmount?: boolean } = {}) => {
        if (!stateRef.current.isLive) return;
        
        const { isUnmount = false } = options;
        
        setIsLive(false);
        disableVideoStream();

        if (!isUnmount) {
            await playNotificationSound('stop', audioContextRefs.current.output);
        }
        
        setIsMuted(false);
        setIsSpeaking(false);
        setIsAiTurn(false);
        
        sessionRefs.current.session?.close();
        await stopAudioProcessing(audioContextRefs, sessionRefs, { keepMicActive: false });

        sessionRefs.current = {
            ...sessionRefs.current,
            session: null,
            sessionPromise: null,
            liveMessageId: null,
            currentInputTranscription: '',
            currentOutputTranscription: '',
            currentToolCalls: [],
            isAiTurn: false,
            pendingMessageQueue: [],
            isTurnFinalizing: false,
        };
    }, [disableVideoStream]);
    
    const enableVideoStream = useCallback(() => {
        if (!stateRef.current.isLive || !sessionRefs.current.sessionPromise) {
            console.warn("Cannot enable video stream: live session is not active.");
            return;
        }
        console.log("Enabling video stream for 30 seconds.");
        setIsVideoStreamEnabled(true);

        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = window.setInterval(() => {
            if (sessionRefs.current.sessionPromise) {
                captureAndStreamFrame(sessionRefs.current.sessionPromise);
            }
        }, 1000);

        if (autoDisableVideoTimeoutRef.current) clearTimeout(autoDisableVideoTimeoutRef.current);
        autoDisableVideoTimeoutRef.current = window.setTimeout(() => {
            disableVideoStream();
        }, 30000);
    }, [captureAndStreamFrame, disableVideoStream]);
    
    const performPause = useCallback((durationInSeconds: number) => {
        if (!stateRef.current.isLive || stateRef.current.isMuted) return;
        console.log(`Pausing listening for ${durationInSeconds} seconds.`);
        setIsMuted(true);
        setTimeout(() => {
            console.log("Resuming listening.");
            if (stateRef.current.isLive) {
                 setIsMuted(false);
            }
        }, durationInSeconds * 1000);
    }, []);

    useEffect(() => {
        const canExecuteAction = !isAiTurn && !isSpeaking && pendingAction;

        if (canExecuteAction) {
            if (pendingAction === 'stop') {
                console.log("AI turn and speech ended, executing pending stop.");
                performStop();
            } else if (pendingAction === 'pause') {
                console.log(`AI turn and speech ended, executing pending pause for ${pendingPauseDuration}s.`);
                performPause(pendingPauseDuration);
            }
            setPendingAction(null);
            setPendingPauseDuration(0);
        }
    }, [isAiTurn, isSpeaking, pendingAction, pendingPauseDuration, performStop, performPause]);
    
    const onError = useCallback((e: ErrorEvent) => {
        console.error('Live session error:', e);
        let userMessage = `An error occurred with the voice session: ${e.message || 'Unknown error'}. The session has been closed.`;

        if (e.message?.toLowerCase().includes('permission')) {
            userMessage = `The AI voice session failed due to a permission error. Please check the following:\n\n1. Your API key is correct and active.\n2. The "Generative Language API" is enabled in your Google Cloud project.\n3. Your API key restrictions (like HTTP referrers) allow this application's domain.`;
        } else if (e.message?.toLowerCase().includes('internal error')) {
            userMessage = `The AI voice session encountered an internal server error. This might be a temporary issue with the service. Please try starting a new session in a few moments.`;
        } else if (e.message?.toLowerCase().includes('deadline expired')) {
            userMessage = `The connection to the AI voice session timed out. This can happen with an unstable network connection or if the browser suspends the audio process. Please try again.`;
        }
        
        propsRef.current.onPermissionError(userMessage);
        performStop();
    }, [performStop]);

    const stopLiveSession = useCallback((options: { immediate?: boolean; isUnmount?: boolean } = {}) => {
        const { immediate = true, isUnmount = false } = options;
        if (isUnmount) {
            performStop({ isUnmount: true });
            return;
        }

        if (immediate) {
            performStop();
        } else {
            setPendingAction('stop');
        }
    }, [performStop]);

    const pauseListening = useCallback((durationInSeconds: number, options: { immediate?: boolean } = {}) => {
        const { immediate = true } = options;
        if (immediate) {
            performPause(durationInSeconds);
        } else {
            setPendingPauseDuration(durationInSeconds);
            setPendingAction('pause');
        }
    }, [performPause]);

    const startLiveSession = useCallback(async (): Promise<boolean> => {
        if (stateRef.current.isLive) return false;

        const { onPermissionError, aiRef, settings, activeThread } = propsRef.current;
        const { input, output } = audioContextRefs.current;
        
        if (input?.state === 'suspended') await input.resume();
        if (output?.state === 'suspended') await output.resume();

        try {
            audioContextRefs.current.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!audioContextRefs.current.input) throw new Error("Input AudioContext not initialized.");
            audioContextRefs.current.micSourceNode = audioContextRefs.current.input.createMediaStreamSource(audioContextRefs.current.micStream);
        } catch (e) {
            console.error("Microphone permission denied:", e);
            const message = Capacitor.isNativePlatform()
                ? "Microphone access was denied. Please enable it in your device's app settings."
                : "Microphone permission was denied. Please enable it in your browser's site settings and reload the page.";
            onPermissionError(message);
            return false;
        }

        await playNotificationSound('start', audioContextRefs.current.output);
        setIsLive(true);
        
        const onOpen = () => {
            connectMicrophoneNodes(audioContextRefs, sessionRefs, stateRef);
        };

        const sessionPromise = createLiveSession({
            aiRef, settings, activeThread, callbacks: { onopen: onOpen, onmessage: onMessage, onerror: onError, onclose: () => {} },
        });

        sessionRefs.current.sessionPromise = sessionPromise;

        sessionPromise.then(session => {
            sessionRefs.current.session = session;
        }).catch(err => {
            console.error("Failed to establish live session:", err);
            propsRef.current.onPermissionError("Could not connect to the live AI service.");
            performStop();
        });

        return true;
    }, [onMessage, onError, performStop]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    const hotSwapSession = useCallback(async () => {
        console.log("Performing session hot-swap for voice change...");
        sessionRefs.current.session?.close();
        if (audioContextRefs.current.scriptProcessor) {
            audioContextRefs.current.scriptProcessor.disconnect();
            audioContextRefs.current.scriptProcessor = null;
        }

        const { aiRef, settings, activeThread } = propsRef.current;
        const onOpen = () => {
            connectMicrophoneNodes(audioContextRefs, sessionRefs, stateRef);
        };
        const newSessionPromise = createLiveSession({
            aiRef, settings, activeThread, callbacks: { onopen: onOpen, onmessage: onMessage, onerror: onError, onclose: () => {} },
        });

        sessionRefs.current.sessionPromise = newSessionPromise;
        newSessionPromise.then(session => {
            sessionRefs.current.session = session;
            console.log("Hot-swap complete. New session is live.");
        }).catch(err => {
            console.error("Failed to establish new session during hot-swap:", err);
            propsRef.current.onPermissionError("Could not update the live AI session.");
            performStop();
        });
    }, [onMessage, onError, performStop]);

    useEffect(() => {
        const input = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const output = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRefs.current.input = input;
        audioContextRefs.current.output = output;
        
        console.log("AudioContexts created.");

        return () => {
            if (stateRef.current.isLive) {
                stopLiveSession({ isUnmount: true, immediate: true });
            }
            input.close().catch(console.error);
            output.close().catch(console.error);
            console.log("AudioContexts closed.");
        };
    }, []);

    useEffect(() => {
        if (!isLive) return;

        const sanityCheckInterval = setInterval(() => {
            const { input } = audioContextRefs.current;
            if (input?.state === 'suspended') {
                console.warn("Input AudioContext was suspended by the browser. Attempting to resume...");
                input.resume().catch(e => console.error("Failed to resume input AudioContext:", e));
            }
        }, 3000);

        return () => clearInterval(sanityCheckInterval);
    }, [isLive]);


    useEffect(() => {
        const currentVoice = props.settings.voiceName;
        const previousVoice = previousVoiceNameRef.current;
        const shouldRestart = isLive && currentVoice !== previousVoice && !isSpeaking && !isAiTurn && !pendingAction;

        if (shouldRestart) {
            previousVoiceNameRef.current = currentVoice;
            hotSwapSession();
        }

        if (!isLive) {
            previousVoiceNameRef.current = currentVoice;
        }
    }, [isLive, isSpeaking, isAiTurn, props.settings.voiceName, hotSwapSession, pendingAction]);

    return { isLive, isMuted, isSpeaking, startLiveSession, stopLiveSession, toggleMute, pauseListening, enableVideoStream, disableVideoStream, isVideoStreamEnabled };
};