const content = `This protocol outlines the official VibeCode style guide for creating React applications. You MUST adhere to these guidelines when writing or modifying JSX components to maintain a consistent, modern, and aesthetically pleasing user interface.

**Core Principles:**
- **Technology:** Use React with TypeScript and function components with Hooks. All styling MUST be done using Tailwind CSS utility classes.
- **Aesthetic ("The Vibe"):** Clean, minimalist, dark-themed, and responsive.
- **Mobile-First:** Design components to look and work great on small screens first, then scale up to larger screens using Tailwind's responsive prefixes (e.g., \`md:\`, \`lg:\`).

**Color Palette (Vibe Theme):**
- **Main Background:** \`bg-vibe-bg-deep\` (e.g., for the overall page background).
- **Panel/Card Background:** \`bg-vibe-panel\` (e.g., for modals, cards, sidebars).
- **Primary Text:** \`text-vibe-text\`.
- **Secondary/Subtle Text:** \`text-vibe-text-secondary\`.
- **Muted/Comment Text:** \`text-vibe-comment\`.
- **Primary Accent/Buttons:** \`bg-vibe-accent\` for background, \`text-white\` for text.
- **Accent Hover State:** \`hover:bg-vibe-accent-hover\`.
- **Borders:** \`border-vibe-panel\` or \`border-vibe-comment\`.

**Layout & Spacing:**
- Use Flexbox (\`flex\`, \`items-center\`, \`justify-between\`) and Grid (\`grid\`, \`grid-cols-*\`) for layouts.
- Use consistent spacing with Tailwind's spacing scale (e.g., \`p-4\`, \`m-2\`, \`gap-4\`). Avoid arbitrary values.
- Components should be well-spaced and not feel cramped.

**Common UI Patterns**

*   **Full-Screen Views:** To make a container fill the entire viewport (e.g., for a full-screen preview), use fixed positioning and inset properties.
    \`\`\`jsx
    const FullScreenComponent = () => (
      <div className="fixed inset-0 z-50 bg-vibe-bg-deep flex flex-col">
        {/* Full screen content goes here */}
      </div>
    );
    \`\`\`

*   **Modals:** A modal consists of a backdrop and a panel. The backdrop covers the screen and centers the panel.
    \`\`\`jsx
    const Modal = ({ onClose }) => (
      <div 
        className="fixed inset-0 bg-vibe-bg/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <div 
          className="bg-vibe-panel rounded-lg shadow-2xl w-full max-w-md"
          onClick={e => e.stopPropagation()} // Prevents closing when clicking inside the modal
        >
          <h2 className="text-xl p-4 border-b border-vibe-bg-deep">Modal Title</h2>
          <div className="p-4">Modal content...</div>
        </div>
      </div>
    );
    \`\`\`

*   **Loading & Disabled States:** Clearly indicate when an action is in progress. Disable buttons to prevent multiple clicks.
    \`\`\`jsx
    const [isLoading, setIsLoading] = useState(false);
    // ...
    <button
      disabled={isLoading}
      className="bg-vibe-accent text-white px-4 py-2 rounded-md flex items-center justify-center hover:bg-vibe-accent-hover disabled:bg-vibe-comment disabled:cursor-wait"
    >
      {isLoading && <SpinnerIcon className="w-5 h-5 mr-2 animate-spin" />}
      {isLoading ? 'Saving...' : 'Save'}
    </button>
    \`\`\`

**File Naming:**
- **Components:** PascalCase (e.g., \`Button.tsx\`, \`UserProfile.tsx\`).
- **Hooks:** camelCase with \`use\` prefix (e.g., \`useUserData.ts\`).
- **Utilities:** camelCase (e.g., \`dateFormatter.ts\`).
`;

export default content;
