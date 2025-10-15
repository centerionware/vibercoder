import { useState, useCallback, useRef, useEffect } from 'react';
import html2canvas from 'html2canvas';
import { getPreviewState, blobToBase64 } from '../../utils/preview';
import { View } from '../../types';
import { LiveSession } from './types';

export const useVideoStream = (
    activeView: View,
    setLiveFrameData: (data: string | null) => void,
    sessionPromise: Promise<LiveSession> | null,
    isLive: boolean
) => {
    const [isVideoStreamEnabled, setIsVideoStreamEnabled] = useState(false);
    const streamIntervalRef = useRef<number | null>(null);
    const autoDisableVideoTimeoutRef = useRef<number | null>(null);
    
    const propsRef = useRef({ activeView, setLiveFrameData });
    useEffect(() => {
        propsRef.current = { activeView, setLiveFrameData };
    }, [activeView, setLiveFrameData]);

    const captureAndStreamFrame = useCallback(async (currentSessionPromise: Promise<LiveSession>) => {
        try {
            const captureTarget = document.getElementById('app-container');
            if (!captureTarget) return;

            const { activeView: currentView } = propsRef.current;
            const previewState = currentView === View.Preview ? await getPreviewState() : null;

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
                    const session = await currentSessionPromise;
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
        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
        if (autoDisableVideoTimeoutRef.current) clearTimeout(autoDisableVideoTimeoutRef.current);
        autoDisableVideoTimeoutRef.current = null;
    }, []);

    const enableVideoStream = useCallback(() => {
        if (!isLive || !sessionPromise) {
            console.warn("[AI Live] Cannot enable video stream: live session is not active.");
            return;
        }
        console.log("[AI Live] Enabling video stream for 30 seconds.");
        setIsVideoStreamEnabled(true);

        if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = window.setInterval(() => {
            if (sessionPromise) captureAndStreamFrame(sessionPromise);
        }, 1000);

        if (autoDisableVideoTimeoutRef.current) clearTimeout(autoDisableVideoTimeoutRef.current);
        autoDisableVideoTimeoutRef.current = window.setTimeout(disableVideoStream, 30000);
    }, [isLive, sessionPromise, captureAndStreamFrame, disableVideoStream]);

    return { isVideoStreamEnabled, enableVideoStream, disableVideoStream };
};
