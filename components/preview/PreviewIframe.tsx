import React, { useRef, useEffect, useState } from 'react';
import { previewHtml } from './previewHtml';

interface PreviewIframeProps {
  builtCode: string;
  onRuntimeError: (error: string) => void;
}

const PreviewIframe: React.FC<PreviewIframeProps> = ({ builtCode, onRuntimeError }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);

  // This effect runs once to set up the message listener for the iframe's entire lifecycle.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Ensure the message is from our iframe to avoid listening to other messages.
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data.type === 'runtime-error') {
        onRuntimeError(event.data.error);
      } else if (event.data.type === 'preview-ready') {
        // The iframe has loaded its initial srcDoc and is ready to receive code.
        setIsReady(true);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRuntimeError]);

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
      sandbox="allow-scripts allow-same-origin"
      className="absolute inset-0 w-full h-full border-0"
    />
  );
};

export default PreviewIframe;