const content = `This protocol is for implementing new features holistically. You MUST go beyond just creating UI elements and ensure the feature is fully functional.

**Core Principle: Deconstruct the Request**
When a user asks for a new feature (e.g., "add a dark mode toggle"), you must break it down into three parts: UI, State, and Logic.

1.  **UI (The View):**
    *   Create the necessary JSX elements for the feature.
    *   You MUST follow the \`react_style_guide\` for all styling and layout.
    *   Ensure the UI is responsive and accessible.

2.  **State (The Data):**
    *   Identify what information needs to be stored to make the feature work.
    *   Use the \`useState\` hook for simple, component-level state.
    *   *Example:* For a toggle, you need state: \`const [isToggled, setIsToggled] = useState(false);\`.

3.  **Logic (The Control):**
    *   Write the functions that update the state and perform the feature's actions.
    *   This is where you implement the "how". Do not create placeholder functions.

**Implementation Examples:**

*   **If asked for a full-screen button:** You MUST implement the full logic, not just a button.
    1.  **State:** Add a state variable to the appropriate component: \`const [isFullScreen, setIsFullScreen] = useState(false);\`.
    2.  **UI:** Create the button and a container. Use conditional classes based on the state.
        \`\`\`jsx
        <div className={isFullScreen ? 'fixed inset-0 z-50 bg-vibe-bg-deep' : 'relative'}>
          <button onClick={() => setIsFullScreen(p => !p)}>
            {isFullScreen ? 'Exit Full Screen' : 'Go Full Screen'}
          </button>
          {/* ... content ... */}
        </div>
        \`\`\`
    3.  **Logic:** The \`onClick\` handler contains the logic.

*   **If asked to play a sound:** You MUST NOT use an \`<audio>\` tag. You MUST use the Web Audio API for full control.
    1.  **Logic:** Create a function that generates and plays the sound.
        \`\`\`jsx
        const playSound = () => {
          // Use an existing AudioContext or create one.
          const audioContext = new (window.AudioContext || window.webkitAudioContext)();
          const oscillator = audioContext.createOscillator();
          const gainNode = audioContext.createGain();

          oscillator.connect(gainNode);
          gainNode.connect(audioContext.destination);

          oscillator.type = 'sine'; // or 'square', 'sawtooth', 'triangle'
          oscillator.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
          gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);

          oscillator.start(audioContext.currentTime);
          oscillator.stop(audioContext.currentTime + 0.3); // Play for 0.3 seconds
        };
        \`\`\`
    2.  **UI:** Create a button that calls this function.
        \`\`\`jsx
        <button onClick={playSound}>Play Sound</button>
        \`\`\`

**Final Step:** After implementing all three parts, switch to the preview to verify the feature works as expected.
`;

export default content;
