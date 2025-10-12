// This is a placeholder for a future implementation where git operations are offloaded to a worker thread.
// Currently, git operations are performed on the main thread via gitService.ts.

self.onmessage = (event: MessageEvent) => {
  console.log('Git worker received message:', event.data);
  // Example of responding to a message
  self.postMessage({ type: 'ack', originalType: event.data.type });
};

console.log('Git worker loaded.');

// Export empty object to satisfy TypeScript's module requirement
export {};
