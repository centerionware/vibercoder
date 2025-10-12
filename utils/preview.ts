import { PreviewState } from '../types';
import { v4 as uuidv4 } from 'uuid';

/**
 * A helper function to post a message to the preview iframe and wait for a specific response.
 * @param payload The message object to send to the iframe.
 * @param successType The `type` string of the success message to listen for.
 * @param errorType The `type` string of the error message to listen for.
 * @param timeoutDuration The timeout in milliseconds.
 * @returns A promise that resolves with the success message data or rejects with an error.
 */
export function postMessageToPreviewAndWait<T>(
  payload: object, 
  successType: string, 
  errorType: string, 
  timeoutDuration: number = 5000
): Promise<T> {
    const iframe = document.querySelector('#preview-iframe') as HTMLIFrameElement;
    if (!iframe) {
        return Promise.reject(new Error('Could not find the preview iframe.'));
    }

    const requestId = uuidv4();

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            window.removeEventListener('message', messageHandler);
            reject(new Error(`Timed out waiting for response type "${successType}" from preview.`));
        }, timeoutDuration);

        const messageHandler = (event: MessageEvent) => {
            const currentIframe = document.querySelector('#preview-iframe') as HTMLIFrameElement;
            if (event.source !== currentIframe?.contentWindow || event.data.requestId !== requestId) {
                 return; // Ignore messages not from our active preview iframe or for a different request
            }
            
            if (event.data.type === successType) {
                clearTimeout(timeout);
                window.removeEventListener('message', messageHandler);
                resolve(event.data);
            } else if (event.data.type === errorType) {
                clearTimeout(timeout);
                window.removeEventListener('message', messageHandler);
                reject(new Error(`Error from preview: ${event.data.message || 'Unknown error'}`));
            }
        };
        
        window.addEventListener('message', messageHandler);
        
        if (iframe.contentWindow) {
            iframe.contentWindow.postMessage({ ...payload, requestId }, '*');
        } else {
            // Immediately fail if the content window isn't even there.
            clearTimeout(timeout);
            window.removeEventListener('message', messageHandler);
            reject(new Error("Preview iframe content window is not available. It might be loading or has crashed."));
        }
    });
}


/**
 * Retrieves a snapshot of the preview's content state (HTML and video frame).
 * @returns A promise resolving to the preview state object, or null.
 */
export async function getPreviewState(): Promise<PreviewState | null> {
    try {
        const response: any = await postMessageToPreviewAndWait(
            { type: 'capture-preview-state' },
            'preview-state-captured',
            'preview-state-error',
            2000 // A shorter timeout is fine for this operation
        );
        return response.payload;
    } catch (error) {
        console.warn('Could not get preview state for screenshot:', error);
        return null;
    }
}

/**
 * Converts a Blob object to a Base64 string, stripping the data URL prefix.
 * @param blob The blob to convert.
 * @returns A promise that resolves with the Base64 encoded string.
 */
export const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            const base64String = reader.result as string;
            resolve(base64String.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
    });
};