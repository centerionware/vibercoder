
import { useRef, useCallback, useEffect } from 'react';

const INACTIVITY_TIMEOUT = 10000; // 10 seconds

/**
 * A hook to manage a timeout that fires a callback after a period of inactivity.
 * @param onTimeout The callback function to execute when the timer expires.
 * @returns An object with `startTimer` and `clearTimer` functions.
 */
export const useInactivityTimer = (onTimeout: () => void) => {
    const timerRef = useRef<number | null>(null);

    /** Clears any active inactivity timer. */
    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    /** Clears any existing timer and starts a new one. */
    const startTimer = useCallback(() => {
        clearTimer();
        console.log(`[AI Live] Starting ${INACTIVITY_TIMEOUT / 1000}s inactivity reset timer.`);
        timerRef.current = window.setTimeout(onTimeout, INACTIVITY_TIMEOUT);
    }, [clearTimer, onTimeout]);

    // Ensure the timer is cleaned up when the component unmounts.
    useEffect(() => {
        return () => clearTimer();
    }, [clearTimer]);

    return { startTimer: startTimer, clearTimer: clearTimer };
};
