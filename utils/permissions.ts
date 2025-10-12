
/**
 * A generic function to request media permissions using the standard Web API.
 * On native platforms, Capacitor intercepts this call and triggers the native OS prompt,
 * provided the correct permissions are declared in the manifest files.
 * @param constraints The media constraints to request (e.g., { audio: true }).
 * @returns A promise that resolves to `true` if permission is granted, and `false` otherwise.
 */
async function requestPermission(constraints: MediaStreamConstraints): Promise<boolean> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        // We requested the stream only to trigger the permission prompt.
        // We should immediately stop the tracks to release the hardware.
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (err) {
        console.error(`Permission denied for constraints: ${JSON.stringify(constraints)}`, err);
        return false;
    }
}

/**
 * Requests microphone permission from the user.
 * @returns {Promise<boolean>} True if permission is granted.
 */
export function requestMicrophonePermission(): Promise<boolean> {
    return requestPermission({ audio: true });
}

/**
 * Requests camera permission from the user.
 * @returns {Promise<boolean>} True if permission is granted.
 */
export function requestCameraPermission(): Promise<boolean> {
    return requestPermission({ video: true });
}

/**
 * Requests both microphone and camera permissions in a single OS prompt.
 * @returns {Promise<boolean>} True if permissions are granted.
 */
export function requestMediaPermissions(): Promise<boolean> {
    return requestPermission({ audio: true, video: true });
}
