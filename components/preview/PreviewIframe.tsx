import React, { useRef, useEffect } from 'react';
import { previewHtml } from './previewHtml';

interface PreviewIframeProps {
  builtCode: string;
  buildId: string;
  onRuntimeError: (error: string) => void;
}

const PreviewIframe: React.FC<PreviewIframeProps> = ({ builtCode, buildId, onRuntimeError }) => {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const codeToSendRef = useRef<string | null>(null);

  useEffect(() => {
    codeToSendRef.current = builtCode;
  }, [builtCode]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) {
        return;
      }

      if (event.data.type === 'runtime-error') {
        onRuntimeError(event.data.error);
      } else if (event.data.type === 'preview-ready') {
        if (codeToSendRef.current) {
          iframeRef.current?.contentWindow?.postMessage({ type: 'execute', code: codeToSendRef.current }, '*');
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [onRuntimeError]);

  return (
    <iframe
      id="preview-iframe"
      key={buildId}
      ref={iframeRef}
      srcDoc={previewHtml}
      title="Preview"
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-full border-0"
    />
  );
};

export default PreviewIframe;
