
import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Buffer } from 'buffer';

// Helper to read the body from a RequestInit object, which isomorphic-git provides as an AsyncIterable
async function readBodyToBuffer(body: BodyInit | null | undefined): Promise<Buffer | undefined> {
    if (!body) return undefined;
    
    // Check if it's an async iterable (isomorphic-git's format)
    if (typeof (body as any)[Symbol.asyncIterator] === 'function') {
        const chunks: Uint8Array[] = [];
        // FIX: Cast to 'unknown' before casting to 'AsyncIterable' to resolve TypeScript error.
        for await (const chunk of body as unknown as AsyncIterable<Uint8Array>) {
            chunks.push(chunk);
        }
        return Buffer.concat(chunks);
    }
    
    console.warn("nativeFetch encountered an unhandled body type. Only AsyncIterable is supported.");
    return undefined;
}

// A `fetch` implementation using Capacitor's native HTTP plugin
export async function capacitorFetch(url: string | URL, options?: RequestInit): Promise<Response> {
    console.log('[VibeCode Debug] capacitorFetch called for URL:', url.toString());

    if (!CapacitorHttp || typeof CapacitorHttp.request !== 'function') {
        const errorMessage = "FATAL: CapacitorHttp.request is not available! The @capacitor/http plugin may not be installed or synced correctly in your native project.";
        console.error(`[VibeCode Debug] ${errorMessage}`);
        // Throw a TypeError to mimic fetch behavior on a critical failure
        throw new TypeError(errorMessage);
    }
    
    let requestBody: Buffer | undefined;
    try {
        requestBody = await readBodyToBuffer(options?.body);
        console.log('[VibeCode Debug] Body read successfully.');
    } catch (e) {
        console.error('[VibeCode Debug] Error in readBodyToBuffer:', e);
        throw e; // Rethrow the error
    }

    const headers: { [key: string]: string } = {};
    if (options?.headers) {
        if (options.headers instanceof Headers) {
            options.headers.forEach((value, key) => { headers[key] = value; });
        } else if (Array.isArray(options.headers)) {
            options.headers.forEach(([key, value]) => { headers[key] = value; });
        } else {
            Object.assign(headers, options.headers as Record<string, string>);
        }
    }
    console.log('[VibeCode Debug] Headers processed:', headers);

    try {
        console.log('[VibeCode Debug] Calling CapacitorHttp.request...');
        const response: HttpResponse = await CapacitorHttp.request({
            method: options?.method || 'GET',
            url: url.toString(),
            headers: headers,
            // Capacitor expects a raw ArrayBuffer, so we get it from our Buffer
            data: requestBody ? requestBody.buffer.slice(requestBody.byteOffset, requestBody.byteOffset + requestBody.byteLength) : undefined,
            responseType: 'arraybuffer'
        });
        console.log('[VibeCode Debug] CapacitorHttp.request succeeded with status:', response.status);

        const responseBody = response.data ? new Uint8Array(response.data as ArrayBuffer) : null;
        
        return new Response(responseBody, {
            status: response.status,
            statusText: `Status ${response.status}`, // Create a status text as native layer doesn't provide one
            headers: response.headers,
        });

    } catch (e: any) {
        // This is the critical fix. On network error, `fetch` should reject, not resolve.
        console.error("[VibeCode Debug] CapacitorHttp.request threw an error:", e);
        // Throw a new TypeError to mimic the behavior of the browser's fetch API on network failure.
        throw new TypeError(`Native network request failed: ${e.message || 'Unknown error'}`);
    }
}


// A `fetch` implementation using Electron's IPC to the main process
export async function electronFetch(url: string | URL, options?: RequestInit): Promise<Response> {
    if (!window.electron?.gitHttpRequest) throw new Error('Electron IPC for git not available.');
    
    const bodyParts: Uint8Array[] = [];
    if (options?.body) {
        // FIX: Safely handle the body by checking if it's an async iterable (isomorphic-git's format) and casting correctly.
        if (typeof (options.body as any)[Symbol.asyncIterator] === 'function') {
            for await (const part of options.body as unknown as AsyncIterable<Uint8Array>) {
              bodyParts.push(part);
            }
        } else {
            console.warn("electronFetch encountered an unhandled body type. Only AsyncIterable is supported.");
        }
    }
    
    const headers: { [key: string]: string } = {};
    if (options?.headers) {
         if (options.headers instanceof Headers) {
            options.headers.forEach((value, key) => { headers[key] = value; });
        } else {
            Object.assign(headers, options.headers as Record<string, string>);
        }
    }
    
    const responseFromMain = await window.electron.gitHttpRequest({
        url: url.toString(),
        method: options?.method || 'GET',
        headers: headers,
        body: bodyParts,
    });
    
    const bodyUint8Array = new Uint8Array(responseFromMain.body.data);
    
    return new Response(bodyUint8Array, {
        status: responseFromMain.statusCode,
        statusText: responseFromMain.statusMessage,
        headers: responseFromMain.headers,
    });
}

/**
 * A polyfill for the global `fetch` function that delegates to the appropriate
 * native implementation (Capacitor or Electron) when available.
 */
export const nativeFetch = (url: string | URL, options?: RequestInit): Promise<Response> => {
    if (Capacitor.isNativePlatform()) {
      return capacitorFetch(url, options);
    }
    if (window.electron?.isElectron) {
      return electronFetch(url, options);
    }
    // Fallback to global fetch if somehow called in a non-native env
    return fetch(url, options);
};