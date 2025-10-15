const content = `This protocol ensures that all UI you create is accessible to users of all abilities, including those who use screen readers or other assistive technologies. You MUST follow these rules for all UI development.

**Core Principles (WCAG):**
1.  **Semantic HTML:** Use HTML elements for their correct purpose.
    -   Use \`<button>\` for clickable actions, not a styled \`<div>\`.
    -   Use \`<nav>\` for navigation links.
    -   Use \`<h1>\`, \`<h2>\`, etc., for headings in a logical order.
    -   Use \`<label>\` for form inputs.

2.  **Label Everything:** All interactive elements must have an accessible name.
    -   If an element has text (e.g., \`<button>Save</button>\`), it's already accessible.
    -   If an element only has an icon (e.g., a close button with an "X" icon), you MUST provide an \`aria-label\`.
    \`\`\`jsx
    // Correct:
    <button aria-label="Close modal">
      <XIcon />
    </button>
    
    // Incorrect:
    <button>
      <XIcon />
    </button>
    \`\`\`

3.  **Image Alternatives:** All \`<img>\` elements that convey information MUST have a descriptive \`alt\` attribute. If an image is purely decorative, provide an empty \`alt=""\`.
    \`\`\`jsx
    // Correct (Informative):
    <img src="/logo.png" alt="VibeCode Company Logo" />

    // Correct (Decorative):
    <img src="/background-swirl.png" alt="" />
    \`\`\`

4.  **Keyboard Navigation:** Ensure all interactive elements can be reached and operated using the Tab key. Using semantic \`<button>\` and \`<a>\` elements handles this automatically. Avoid using custom elements with \`onClick\` handlers that cannot be focused.

5.  **Color Contrast:** While the Vibe theme is pre-configured for good contrast, be mindful when adding new colors. Text should be easily readable against its background.
`;

export default content;
