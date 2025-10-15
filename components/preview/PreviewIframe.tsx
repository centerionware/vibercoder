import React, { useRef, useEffect, useState, useMemo } from 'react';
import { previewHtml } from './previewHtml';

interface PreviewIframeProps {
  builtCode: string;
  onRuntimeError: (error: string) => void;
}

const PreviewIframe: React.FC<PreviewIframeProps> = ({ builtCode, onRuntimeError }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isReady, setIsReady] = useState(false);

  // Memoize the data URL to prevent the iframe from reloading on every render unless the html changes.
  const iframeSrc = useMemo(() => `data:text/html;charset=utf-8,${encodeURIComponent(previewHtml)}`, []);


  // This effect runs once to set up the message listener for the iframe's entire lifecycle.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Using a data URL creates a unique origin, so we can't do a strict origin check.
      // We rely on the source window being the one from our ref.
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data.type === 'runtime-error') {
        onRuntimeError(event.data.error);
      } else if (event.data.type === 'preview-ready') {
        // The iframe has loaded its initial content and is ready to receive code.
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
      src={iframeSrc}
      title="Preview"
      sandbox="allow-scripts allow-forms allow-modals allow-popups allow-downloads"
      className="absolute inset-0 w-full h-full border-0"
    />
  );
};

export default PreviewIframe;