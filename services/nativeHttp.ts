import { Capacitor, CapacitorHttp, HttpResponse } from '@capacitor/core';
import { Buffer } from 'buffer';

// Extend Window interface to include Electron's preload script properties
declare global {
  interface Window {
    electron?: {
      isElectron: boolean;
      gitHttpRequest: (options: any) => Promise<any>;
    };
  }
}

// The interface isomorphic-git expects for its custom http client
interface GitHttpRequest {
  url: string;
  method?: string;
  headers?: { [key: string]: string };
  body?: AsyncIterable<Uint8Array>;
}

// FIX: Update body type to match isomorphic-git's expectation of an async iterable.
interface GitHttpResponse {
  url: string;
  method: string;
  statusCode: number;
  statusMessage: string;
  body: AsyncIterableIterator<Uint8Array>;
  headers: { [key: string]: string };
}

// FIX: Helper to convert a single Uint8Array chunk into an async iterable.
async function* singleChunkAsyncIterable(chunk: Uint8Array): AsyncIterableIterator<Uint8Array> {
    yield chunk;
}


/**
 * Handles Git HTTP requests using Capacitor's native HTTP plugin.
 */
async function capacitorRequest(request: GitHttpRequest): Promise<GitHttpResponse> {
  const bodyParts: Uint8Array[] = [];
  if (request.body) {
    for await (const chunk of request.body) {
      bodyParts.push(chunk);
    }
  }
  const requestBody = Buffer.concat(bodyParts);

  // Set standard git-like headers to ensure the server responds with the correct protocol.
  const headers = {
    ...request.headers,
    'User-Agent': 'git/isomorphic-git (capacitor)',
    'Accept': '*/*', // Add a generic Accept header
  };

  try {
    const response: HttpResponse = await CapacitorHttp.request({
      method: request.method || 'GET',
      url: request.url,
      headers: headers,
      // CapacitorHttp on native platforms can handle ArrayBuffer directly for binary data.
      data: requestBody.length > 0 ? requestBody.buffer : undefined,
      // Ask for binary data in response.
      responseType: 'arraybuffer'
    });

    // `response.data` will be an ArrayBuffer, convert it to Uint8Array for isomorphic-git
    const responseBody = new Uint8Array(response.data);

    return {
      url: response.url,
      method: request.method || 'GET',
      statusCode: response.status,
      statusMessage: `Status ${response.status}`, // Capacitor does not provide a status message string
      // FIX: Wrap the response body in an async iterable to match the required type.
      body: singleChunkAsyncIterable(responseBody),
      headers: response.headers,
    };
  } catch (nativeError: any) {
    console.error("CapacitorHttp native layer threw an error:", nativeError);
    // Re-throw a more informative error for the main git service to catch.
    throw new Error(`Native HTTP request failed: ${nativeError.message || 'Unknown native error'}`);
  }
}

/**
 * Handles Git HTTP requests by proxying them to the Electron main process via IPC.
 */
async function electronRequest(request: GitHttpRequest): Promise<GitHttpResponse> {
  if (!window.electron?.gitHttpRequest) {
    throw new Error('Electron IPC for git not available.');
  }

  const bodyParts: Uint8Array[] = [];
  if (request.body) {
    for await (const part of request.body) {
      bodyParts.push(part);
    }
  }
  
  // Pass the request to the main process via IPC
  const response = await window.electron.gitHttpRequest({
    ...request,
    body: bodyParts, // Send concatenated body parts
  });
  
  // The body comes back from IPC as a Buffer-like object: { type: 'Buffer', data: [...] }
  // We need to reconstruct it into a Uint8Array for isomorphic-git.
  const bodyUint8Array = new Uint8Array(response.body.data);

  // FIX: Wrap the response body in an async iterable to match the required type.
  return { ...response, body: singleChunkAsyncIterable(bodyUint8Array) };
}

/**
 * A custom isomorphic-git http client that delegates to the appropriate native method.
 */
export const nativeHttp = {
  async request(request: GitHttpRequest): Promise<GitHttpResponse> {
    if (Capacitor.isNativePlatform()) {
      return capacitorRequest(request);
    }
    if (window.electron?.isElectron) {
      return electronRequest(request);
    }
    // This client should only be used in native environments.
    // The calling service is responsible for this check, but this is a safeguard.
    throw new Error('nativeHttp client called in a non-native environment.');
  }
};