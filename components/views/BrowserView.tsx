import React from 'react';
import BrowserIcon from '../icons/BrowserIcon';

// This view now serves as a placeholder. The actual browser content is rendered
// in a native Activity (Android) or ViewController (iOS) on top of the webview.
const BrowserView: React.FC = () => {
  return (
    <div className="flex flex-col flex-1 h-full bg-vibe-bg-deep items-center justify-center text-center p-4">
        <BrowserIcon className="w-16 h-16 text-vibe-comment mb-4 animate-pulse" />
        <p className="text-vibe-comment max-w-sm">
            The native browser is active. Use the AI to navigate or close it.
        </p>
    </div>
  );
};

export default BrowserView;
