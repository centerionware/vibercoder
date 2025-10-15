import { useState, useRef, useCallback, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { v4 as uuidv4 } from 'uuid';
import { Capacitor } from '@capacitor/core';
import { UseAiLiveProps, View, ToolCall, ToolCallStatus } from '../types';
import { playNotificationSound } from '../utils/audio';
import { createLiveSession } from './useAiLive/sessionManager';
import { connectMicrophoneNodes, stopAudioProcessing } from './useAiLive/audioManager';
import { AudioContextRefs, SessionRefs, LiveSession } from './useAiLive/types';
import { getPreviewState, blobToBase64 } from '../utils/preview';
import { interruptPlayback, playAudioChunk } from './useAiLive/playbackQueue';
import { requestMediaPermissions } from '../utils/permissions';

const INACTIVITY_TIMEOUT = 10000; // 10 seconds

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
    
    const retryRef = useRef({
        count: 0,
        maxRetries: 3,
        delay: 1000, // Initial delay in ms
        timeoutId: null as number | null,
    });

    const isSessionDirty = useRef(false);
    const stopExecutionRef = useRef(false);

    const uiUpdateTimerRef = useRef<number | null>(null);
    const previousVoiceNameRef = useRef(props.settings.voiceName);
    const streamIntervalRef = useRef<number | null>(null);
    const autoDisableVideoTimeoutRef = useRef<number | null>(null);
    const endOfTurnTimerRef = useRef<number | null>(null);
    const inactivityTimerRef = useRef<number | null>(null);
    const inactivityResetCallbackRef = useRef<() => void>();


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
    
    const startTurnIfNeeded = useCallback(() => {
        if (!sessionRefs.current.liveMessageId) {
            // This is the start of a new conversational turn
            propsRef.current.onStartAiRequest(); // START VFS SESSION
            sessionRefs.current.liveMessageId = uuidv4();
            propsRef.current.addMessage({ id: sessionRefs.current.liveMessageId, role: 'user', content: '', isLive: true });
            propsRef.current.addMessage({ id: `${sessionRefs.current.liveMessageId}-model`, role: 'model', content: '', isLive: true });
            stopExecutionRef.current = false; // Reset stop flag at the start of a new turn.
        }
    }, []);

    const processModelOutput = useCallback(async (message: any) => {
        const { addMessage, updateMessage, toolImplementations } = propsRef.current;
    
        if (message.serverContent && !sessionRefs.current.isAiTurn) {
            sessionRefs.current.isAiTurn = true;
            setIsAiTurn(true);
            playNotificationSound('ai-start', audioContextRefs.current.output);
        }
    
        const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
        if (base64Audio) {
            await playAudioChunk(base64Audio, audioContextRefs, sessionRefs, setIsSpeaking);
        }
        
        const outputTranscription = message.serverContent?.outputTranscription?.text;
        if (outputTranscription) {
            startTurnIfNeeded();
            sessionRefs.current.currentOutputTranscription += outputTranscription;
            requestUiUpdate();
        }
    
        if (message.toolCall) {
            startTurnIfNeeded();
    
            const newToolCalls: ToolCall[] = message.toolCall.functionCalls.map((fc: any) => ({
                id: fc.id, name: fc.name, args: fc.args, status: ToolCallStatus.IN_PROGRESS,
            }));
    
            sessionRefs.current.currentToolCalls.push(...newToolCalls);
            requestUiUpdate();
    
            for (const fc of message.toolCall.functionCalls) {
                // Check for stop signal before each tool execution
                if (stopExecutionRef.current) {
                    console.log('[AI Live] Halting tool execution due to user "stop" command.');
                    
                    // Update UI to mark remaining in-progress tools as cancelled
                    sessionRefs.current.currentToolCalls = sessionRefs.current.currentToolCalls.map(tc =>
                        tc.status === ToolCallStatus.IN_PROGRESS ? { ...tc, status: ToolCallStatus.CANCELLED } : tc
                    );
                    requestUiUpdate();
                    
                    // Acknowledge the stop in the transcript
                    sessionRefs.current.currentOutputTranscription += "\n\n*Tool execution cancelled by user.*";
                    
                    // We must break the loop to stop processing further tools.
                    break;
                }

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
                    session?.sendToolResponse({ functionResponses: { id: fc.id, name: fc.name, response: { result: { error } } } });
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
    }, [requestUiUpdate, startTurnIfNeeded]);

    const processInputTranscription = useCallback((message: any) => {
        // Any user activity detected, cancel inactivity timer
        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
        }
        startTurnIfNeeded();

        const newText = message.serverContent.inputTranscription.text;
        
        const isAiWorking = sessionRefs.current.currentToolCalls.some(tc => tc.status === ToolCallStatus.IN_PROGRESS);

        // If the AI is working and the user says "stop", treat it as a command, not speech.
        if (isAiWorking && /\bstop\b/i.test(newText)) {
            console.log('[AI Live] "stop" command detected and handled.');
            stopExecutionRef.current = true;
            // Do NOT append "stop" to the transcription. We just consume it as a command.
        } else {
            // Otherwise, it's normal speech.
            sessionRefs.current.currentInputTranscription += newText;
        }
        
        requestUiUpdate();
    }, [requestUiUpdate, startTurnIfNeeded]);

    const finalizeTurn = useCallback(() => {
        console.log("[AI Live] Finalizing turn, processing message queue.");
        playNotificationSound('ai-stop', audioContextRefs.current.output);
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
            // End the VFS session for the completed turn
            propsRef.current.onEndAiRequest();
        }

        sessionRefs.current.liveMessageId = null;
        sessionRefs.current.currentInputTranscription = '';
        sessionRefs.current.currentOutputTranscription = '';
        sessionRefs.current.currentToolCalls = [];
        stopExecutionRef.current = false; // Reset for the next turn

        // Start the inactivity timer to perform a silent reset if the user doesn't speak.
        if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
        console.log(`[AI Live] Starting ${INACTIVITY_TIMEOUT / 1000}s inactivity reset timer.`);
        inactivityTimerRef.current = window.setTimeout(() => {
            inactivityResetCallbackRef.current?.();
        }, INACTIVITY_TIMEOUT);

    }, [processModelOutput, cancelUiUpdate, setIsAiTurn]);


    const onMessage = useCallback((message: any) => {
        isSessionDirty.current = true;
    
        // --- 1. Handle user's speech ---
        if (message.serverContent?.inputTranscription) {
            // Any user input cancels the inactivity reset timer and any pending "turn complete" timer.
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
            if (endOfTurnTimerRef.current) clearTimeout(endOfTurnTimerRef.current);
            sessionRefs.current.isTurnFinalizing = false;
    
            // If user interrupts, clear queued AI messages and stop playback.
            if (sessionRefs.current.pendingMessageQueue.length > 0) {
                console.log("[AI Live] User interrupted; discarding premature AI response.");
                sessionRefs.current.pendingMessageQueue = [];
                interruptPlayback(sessionRefs);
                setIsSpeaking(false);
            }
    
            processInputTranscription(message);
            return; // Early exit, this message is just user speech.
        }
    
        // --- 2. Handle speech interruption signal ---
        if (message.serverContent?.interrupted) {
            console.log('[AI Live] Speech interrupted by user.');
            interruptPlayback(sessionRefs);
            setIsSpeaking(false);
            // Do not return; the `interrupted` signal might accompany other data.
        }
    
        // --- 3. Queue or Process Model's Turn ---
        const isModelTurnMessage = message.toolCall || message.serverContent?.modelTurn || message.serverContent?.outputTranscription;
        
        if (isModelTurnMessage) {
            if (sessionRefs.current.isTurnFinalizing) {
                sessionRefs.current.pendingMessageQueue.push(message);
            } else {
                processModelOutput(message);
            }
        }
    
        // --- 4. Handle End of Turn ---
        if (message.serverContent?.turnComplete) {
            if (!sessionRefs.current.isTurnFinalizing) {
                console.log("[AI Live] turnComplete received. Starting 1s cooldown timer.");
                sessionRefs.current.isTurnFinalizing = true;
                endOfTurnTimerRef.current = window.setTimeout(finalizeTurn, 1000);
            }
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
        console.log("[AI Live] Disabling video stream.");
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

        // Cancel any pending reconnect attempt and reset retry state.
        if (retryRef.current.timeoutId) {
            clearTimeout(retryRef.current.timeoutId);
            retryRef.current.timeoutId = null;
        }
        retryRef.current.count = 0;

        if (inactivityTimerRef.current) {
            clearTimeout(inactivityTimerRef.current);
            inactivityTimerRef.current = null;
        }
        
        isSessionDirty.current = false;
        
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
        
        // Finalize any pending turn to clean up VFS
        if (sessionRefs.current.liveMessageId) {
            finalizeTurn();
        }

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
    }, [disableVideoStream, finalizeTurn]);
    
    const enableVideoStream = useCallback(() => {
        if (!stateRef.current.isLive || !sessionRefs.current.sessionPromise) {
            console.warn("[AI Live] Cannot enable video stream: live session is not active.");
            return;
        }
        console.log("[AI Live] Enabling video stream for 30 seconds.");
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
        console.log(`[AI Live] Pausing listening for ${durationInSeconds} seconds.`);
        setIsMuted(true);
        setTimeout(() => {
            console.log("[AI Live] Resuming listening.");
            if (stateRef.current.isLive) {
                 setIsMuted(false);
            }
        }, durationInSeconds * 1000);
    }, []);

    useEffect(() => {
        const canExecuteAction = !isAiTurn && !isSpeaking && pendingAction;

        if (canExecuteAction) {
            if (pendingAction === 'stop') {
                console.log("[AI Live] AI turn and speech ended, executing pending stop.");
                performStop();
            } else if (pendingAction === 'pause') {
                console.log(`[AI Live] AI turn and speech ended, executing pending pause for ${pendingPauseDuration}s.`);
                performPause(pendingPauseDuration);
            }
            setPendingAction(null);
            setPendingPauseDuration(0);
        }
    }, [isAiTurn, isSpeaking, pendingAction, pendingPauseDuration, performStop, performPause]);
    
    // Forward-declare initiateSession to resolve circular dependency
    let initiateSession: () => void;

    const onError = useCallback((e: ErrorEvent) => {
        console.error('Live session error:', e);

        // Don't retry for permission-related errors as they are not transient.
        const isRetryable = !e.message?.toLowerCase().includes('permission');

        if (isRetryable && retryRef.current.count < retryRef.current.maxRetries) {
            retryRef.current.count++;
            const delay = retryRef.current.delay * Math.pow(2, retryRef.current.count - 1);
            console.warn(`[AI Live] Retryable error detected. Attempting reconnect #${retryRef.current.count} in ${delay}ms...`);
            
            if (retryRef.current.timeoutId) clearTimeout(retryRef.current.timeoutId);

            retryRef.current.timeoutId = window.setTimeout(() => {
                retryRef.current.timeoutId = null;
                console.log('[AI Live] Performing silent session reset due to error.');
                isSessionDirty.current = false;
                
                sessionRefs.current.session?.close();
                if (audioContextRefs.current.scriptProcessor) {
                    audioContextRefs.current.scriptProcessor.disconnect();
                    audioContextRefs.current.scriptProcessor = null;
                }
                
                initiateSession();
            }, delay);

        } else {
            console.error(`[AI Live] Unretryable error or max retries reached. Stopping session.`);
            let userMessage = `An error occurred with the voice session: ${e.message || 'Unknown error'}. The session has been closed.`;

            if (e.message?.toLowerCase().includes('permission')) {
                userMessage = `The AI voice session failed due to a permission error. Please check the following:\n\n1. Your API key is correct and active.\n2. The "Generative Language API" is enabled in your Google Cloud project.\n3. Your API key restrictions (like HTTP referrers) allow this application's domain.`;
            } else if (retryRef.current.count >= retryRef.current.maxRetries) {
                userMessage = `The AI voice session failed to reconnect after multiple attempts. There might be a temporary network or service issue. The session has been closed. Please try starting a new session manually.`;
            }
            
            propsRef.current.onPermissionError(userMessage);
            performStop();
        }
    }, [performStop, () => initiateSession()]);

    initiateSession = useCallback(() => {
        const { aiRef, settings, activeThread } = propsRef.current;
        const onOpen = () => {
            if (retryRef.current.count > 0) {
                console.log('[AI Live] Reconnect successful. Resetting retry count.');
                playNotificationSound('reconnect', audioContextRefs.current.output);
            }
            retryRef.current.count = 0;
            if (retryRef.current.timeoutId) {
                clearTimeout(retryRef.current.timeoutId);
                retryRef.current.timeoutId = null;
            }
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
            propsRef.current.onPermissionError("Could not connect to the live AI service. Please check your API key and network connection.");
            performStop();
        });
    }, [onMessage, onError, performStop]);

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

    useEffect(() => {
        inactivityResetCallbackRef.current = () => {
            if (!stateRef.current.isLive) return;
            
            console.log('[AI Live] Inactivity timer fired. Checking if session is dirty.');
    
            if (!isSessionDirty.current) {
                console.log("[AI Live] Session is clean. Skipping reset.");
                return;
            }
    
            console.log("[AI Live] Session is dirty. Performing silent session reset.");
            
            isSessionDirty.current = false; // Reset the flag for the new session.
            
            sessionRefs.current.session?.close();
            if (audioContextRefs.current.scriptProcessor) {
                audioContextRefs.current.scriptProcessor.disconnect();
                audioContextRefs.current.scriptProcessor = null;
            }
            
            initiateSession();
        };
    }, [initiateSession]);


    const startLiveSession = useCallback(async (): Promise<boolean> => {
        if (stateRef.current.isLive) return false;
        
        // Reset retry state on any manual start attempt.
        retryRef.current.count = 0;
        if (retryRef.current.timeoutId) {
            clearTimeout(retryRef.current.timeoutId);
            retryRef.current.timeoutId = null;
        }

        const { onPermissionError } = propsRef.current;
        const { input, output } = audioContextRefs.current;
        
        if (input?.state === 'suspended') await input.resume();
        if (output?.state === 'suspended') await output.resume();

        try {
            const hasPermissions = await requestMediaPermissions();
            if (!hasPermissions) {
                throw new Error('Required permissions were not granted by the user.');
            }

            audioContextRefs.current.micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            if (!audioContextRefs.current.input) throw new Error("Input AudioContext not initialized.");
            audioContextRefs.current.micSourceNode = audioContextRefs.current.input.createMediaStreamSource(audioContextRefs.current.micStream);
        } catch (e) {
            console.error("Permission denied for live session:", e);
            const message = Capacitor.isNativePlatform()
                ? "Microphone and Camera access are required for live sessions. Please go to your device's app settings to enable these permissions for VibeCode."
                : "Microphone and Camera permissions were denied. Please enable them in your browser's site settings and reload the page.";
            onPermissionError(message);
            return false;
        }
        
        isSessionDirty.current = false;

        await playNotificationSound('start', audioContextRefs.current.output);
        setIsLive(true);
        initiateSession();
        return true;
    }, [initiateSession]);

    const toggleMute = useCallback(() => {
        setIsMuted(prev => !prev);
    }, []);

    const hotSwapSession = useCallback(async () => {
        console.log("[AI Live] Performing session hot-swap for voice change...");
        sessionRefs.current.session?.close();
        if (audioContextRefs.current.scriptProcessor) {
            audioContextRefs.current.scriptProcessor.disconnect();
            audioContextRefs.current.scriptProcessor = null;
        }

        initiateSession();
        console.log("[AI Live] Hot-swap complete. New session is live.");

    }, [initiateSession]);

    useEffect(() => {
        const input = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
        const output = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
        audioContextRefs.current.input = input;
        audioContextRefs.current.output = output;
        
        console.log("AudioContexts created.");

        return () => {
            if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
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