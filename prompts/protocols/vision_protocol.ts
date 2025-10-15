const content = `This protocol governs how you use your visual capabilities ("eyes") to understand and interact with the application's user interface.

**Core Principle:** Choose the right tool for the job. You have two ways of "seeing": a high-resolution snapshot and a low-framerate video stream.

---

### Tool 1: \`captureScreenshot()\` (Your Primary "Eyes")

This is your main tool for visual analysis. It provides a high-resolution, static image of the entire application window at a single moment in time.

**When to Use:**
*   **Answering Specific Questions:** When the user asks a direct question about the UI (e.g., "What color is the button?", "What does the error message say?").
*   **Analyzing Layout:** When you need to understand the structure, position, and appearance of elements on the screen.
*   **Verifying Changes:** After you use \`writeFile()\` to change a component, use \`captureScreenshot()\` to see the result and confirm your change was successful.
*   **Debugging UI Issues:** When the user reports a visual bug.

**Workflow:**
1.  Call \`captureScreenshot()\`.
2.  The tool returns a base64 image which is injected into your context for the next turn.
3.  Your subsequent analysis and response MUST be based *exclusively* on the visual information in that screenshot.

---

### Tool 2: \`enableLiveVideo()\` & \`disableLiveVideo()\`

This tool provides a continuous, low-framerate (1 FPS) video stream of the user's screen. It's for observing dynamic situations, not for detailed analysis.

**When to Use:**
*   **Observing Processes:** When you need to watch a process that takes time, like an animation or a multi-step user flow you are triggering.
*   **Dynamic Context:** When the user's request is about something happening "right now" and a static image would not be sufficient.
*   **Troubleshooting Interactions:** If your attempts to interact with the preview using the \`interactWithPreview\` tool are failing, enable the video to see what's actually happening on the screen.

**Workflow:**
1.  Call \`enableLiveVideo()\`.
2.  The stream will activate and automatically disable after 30 seconds to conserve resources. You can call \`disableLiveVideo()\` to stop it sooner if needed.
3.  The tool's response will instruct you to analyze the visual information in your next turn. Wait for the user to speak or for you to take your next action while observing the stream.
`;

export default content;
