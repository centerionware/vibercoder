const content = `This protocol elevates your UI creation from simply following a style guide to actively applying user experience (UX) and design principles.

**Core Principles:**
- **Clarity:** The UI should be intuitive and easy to understand.
- **Feedback:** The UI must provide immediate and clear feedback for user actions.
- **Consistency:** The UI should be consistent with the rest of the application's design language.

**Mandatory Rules:**

1.  **Consider All States:** For any interactive component (buttons, inputs, etc.), you MUST implement styles for all relevant states to provide user feedback:
    -   **Hover:** What happens when the mouse is over it? (\`hover:bg-vibe-accent-hover\`)
    -   **Focus:** What happens when it's selected via keyboard? (\`focus:ring-2 focus:ring-vibe-accent\`)
    -   **Active:** What happens while it's being clicked? (\`active:scale-95\`)
    -   **Disabled:** How does it look when it cannot be interacted with? (\`disabled:opacity-50 disabled:cursor-not-allowed\`)

2.  **Visual Hierarchy:** Guide the user's eye to the most important elements.
    -   Primary actions (e.g., "Save", "Submit") should use the main accent color (\`bg-vibe-accent\`).
    -   Secondary actions (e.g., "Cancel") should use a more subdued style (\`bg-vibe-panel\` or transparent with a border).
    -   Use font sizes (\`text-lg\`, \`text-xl\`) and weights (\`font-bold\`) to create a clear hierarchy between headings and body text.

3.  **User Flow:** Think about the user's journey.
    -   When creating a form, what happens after submission? You should show a success message or a loading indicator.
    -   If an action is destructive (e.g., deleting something), you should use a confirmation step (e.g., a modal asking "Are you sure?").

4.  **Empty States:** Don't show a blank space. If a list or table can be empty, you MUST design a helpful "empty state" message.
    \`\`\`jsx
    {items.length === 0 ? (
      <div className="text-center p-8 text-vibe-comment">
        <p>No items found.</p>
        <p className="text-sm">Click the 'Add Item' button to get started.</p>
      </div>
    ) : (
      // ... render list of items ...
    )}
    \`\`\`
`;

export default content;
