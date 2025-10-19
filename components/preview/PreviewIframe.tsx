import React, { useRef, useEffect, useState } from 'react';
import { previewHtml } from './previewHtml';
import { PreviewLogEntry } from '../../types';

interface PreviewIframeProps {
  builtCode: string;
  onProxyFetch: (request: any) => void;
  onVirtualStorageRequest: (request: any) => void;
  onConsoleMessage: (log: Omit<PreviewLogEntry, 'id'>) => void;
}

const PreviewIframe: React.FC<PreviewIframeProps> = ({ builtCode, onProxyFetch, onVirtualStorageRequest, onConsoleMessage }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);

  // This effect runs once to set up the message listener for the iframe's entire lifecycle.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      const { type, payload } = event.data;

      switch(type) {
        case 'preview-ready':
          setIsReady(true);
          break;
        case 'proxy-fetch':
          onProxyFetch(event.data);
          break;
        case 'virtual-storage-request':
          onVirtualStorageRequest(event.data);
          break;
        case 'console-message':
          onConsoleMessage(payload);
          break;
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onProxyFetch, onVirtualStorageRequest, onConsoleMessage]);

  // This effect runs whenever the built code changes or the iframe becomes ready.
  // It sends the new code to the iframe for execution.
  useEffect(() => {
    if (isReady && builtCode) {
      iframeRef.current?.contentWindow?.postMessage({ type: 'execute', code: builtCode }, '*');
    }
  }, [isReady, builtCode]);

  return (
    <iframe
      id="preview-iframe"
      ref={iframeRef}
      srcDoc={previewHtml}
      title="Preview"
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads allow-same-origin"
      className="absolute inset-0 w-full h-full border-0"
    />
  );
};

export default PreviewIframe;
