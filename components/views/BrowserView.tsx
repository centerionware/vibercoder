import React, { useRef, useEffect } from 'react';

interface BrowserViewProps {
  setContainer: (element: HTMLElement | null) => void;
}

const BrowserView: React.FC<BrowserViewProps> = ({ setContainer }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (containerRef.current) {
      setContainer(containerRef.current);
    }
    // Return a cleanup function to unregister the container when the view is unmounted.
    return () => {
      setContainer(null);
    };
  }, [setContainer]);

  return (
    <div
      ref={containerRef}
      className="flex-1 w-full h-full bg-black"
      // This container defines the area where the native browser view will be displayed.
      // The `useBrowser` hook will observe this element's size and position.
    />
  );
};

export default BrowserView;