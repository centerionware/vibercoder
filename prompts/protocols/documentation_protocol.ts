const content = `This protocol governs how you write documentation for the code you create or modify.

**Core Principle:** Good documentation makes the code easier for humans to understand. It should explain the 'why' (intent) more than the 'what' (the code itself).

**Mandatory Rules:**
1.  **JSDoc for Functions and Components:**
    -   For every new non-trivial function or React component you create, you MUST add a JSDoc comment block above it.
    -   The comment MUST include a brief description of the component/function's purpose.
    -   For React components, use \`@param\` to describe each prop in the \`Props\` interface.
    -   For functions, use \`@param\` for each parameter and \`@returns\` to describe the return value.
    \`\`\`jsx
    /**
     * Renders a styled button with loading and disabled states.
     * @param {boolean} isLoading - If true, shows a spinner and disables the button.
     * @param {() => void} onClick - The function to call when the button is clicked.
     * @param {ReactNode} children - The content to display inside the button.
     */
    const Button = ({ isLoading, onClick, children }) => {
      // ... component logic ...
    };
    \`\`\`

2.  **Inline Comments for Complex Logic:**
    -   For any block of code that is complex, non-obvious, or relies on a clever trick, you MUST add a concise, single-line or multi-line comment (\`// ...\` or \`/* ... */\`) explaining the logic.
    -   Do NOT comment on obvious code.
    -   **Good Comment (explains 'why'):** \`// We use a debounce here to prevent firing too many API calls while the user is typing.\`
    -   **Bad Comment (explains 'what'):** \`// Increment i by 1.\`
`;

export default content;
