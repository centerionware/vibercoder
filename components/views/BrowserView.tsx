import React, { useRef, useEffect } from 'react';
import BrowserIcon from '../icons/BrowserIcon';
import { isNativeEnvironment } from '../../utils/environment';

interface BrowserViewProps {
  setContainer: (element: HTMLElement | null) => void;
}

const BrowserView: React.FC<BrowserViewProps> = ({ setContainer }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      setContainer(containerRef.current);
    }
    // Clean up on unmount
    return () => setContainer(null);
  }, [setContainer]);

  if (!isNativeEnvironment()) {
    return (
        <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep items-center justify-center text-center p-4">
            <BrowserIcon className="w-16 h-16 text-vibe-comment mb-4" />
            <p className="text-vibe-comment max-w-sm">
                The embedded browser is only available in the mobile or desktop app. The AI can still perform web searches, but the live view is disabled in this web-only environment.
            </p>
        </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 w-full h-full bg-vibe-bg-deep overflow-hidden">
        {/* The native browser view will be positioned over this div */}
    </div>
  );
};

export default BrowserView;
