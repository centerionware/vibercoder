
// This is the core of the CORS proxy serverless function.
// It is designed to be platform-agnostic and can be deployed to Vercel, Netlify,
// or Cloudflare Workers with minimal or no changes.

// The `Request` and `Response` objects are part of the standard Fetch API,
// which is available in all modern serverless runtimes.

async function handleRequest(request) {
  // Define the CORS headers that will be added to the response.
  // Allowing all origins ('*') is acceptable here because the user deploys this
  // proxy to their own account, so they are in control of who can access it.
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS, PUT, DELETE, PATCH',
    'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') || '*',
    'Access-Control-Max-Age': '86400', // 24 hours
  };

  // The browser sends an OPTIONS request first to check CORS permissions (a "preflight" request).
  // We need to handle this by returning a response with just the CORS headers.
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204, // No Content
      headers: corsHeaders,
    });
  }

  // Extract the target URL from the request.
  // The client will make a request like `https://my-proxy.com/https://github.com/...`
  const url = new URL(request.url);
  const proxyUrl = url.pathname.substring(1) + url.search;

  // --- URL VALIDATION ---
  // A simple validation to ensure a valid URL is being requested.
  try {
      new URL(proxyUrl);
  } catch (e) {
      const response = new Response('Invalid target URL provided to proxy.', { status: 400 });
      Object.entries(corsHeaders).forEach(([key, value]) => {
          response.headers.set(key, value);
      });
      return response;
  }
  
  // Create a new request object to forward to the target URL.
  // We copy the method, headers, and body from the original request.
  const newRequest = new Request(proxyUrl, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: 'follow', // Follow redirects, important for general web browsing
  });
  
  // Make the actual request to the target site.
  const targetResponse = await fetch(newRequest);

  // Create a new response to send back to the browser.
  // We pass the body, status, and status text from the target's response.
  // We also pass the original headers, which we will then modify.
  const response = new Response(targetResponse.body, {
    status: targetResponse.status,
    statusText: targetResponse.statusText,
    headers: targetResponse.headers,
  });

  // --- HEADER STRIPPING ---
  // This is the critical step. We remove headers that prevent the browser
  // from embedding the page in an iframe.
  response.headers.delete('X-Frame-Options');
  response.headers.delete('Content-Security-Policy');
  response.headers.delete('x-content-security-policy');

  // Finally, add our permissive CORS headers to the response, overwriting any
  // that may have come from the target.
  Object.entries(corsHeaders).forEach(([key, value]) => {
    response.headers.set(key, value);
  });

  return response;
}


// --- Platform-Specific Export ---
// This structure allows the same file to be used across different platforms.

// Vercel and Netlify (and others using a similar Node.js-style export)
// They typically look for a default export or a handler function.
export default async function (req) {
  return handleRequest(req);
}

// Cloudflare Workers (uses a module worker format)
// The `export default { fetch: ... }` object is the entry point.
// try {
//   if (process.env.IS_CLOUDFLARE_WORKER) { // A way to detect CF environment
//     addEventListener('fetch', event => {
//       event.respondWith(handleRequest(event.request));
//     });
//   }
// } catch (e) {
//   // This will fail in non-CF environments, which is fine.
// }
// A simpler way for Cloudflare is to have a separate entry file `_worker.js` that imports and uses this file.
// For now, the default export covers the most common serverless function signatures.
