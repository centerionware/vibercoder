const content = `This protocol defines how you should report back to the user after completing a task. It's like writing a mini pull request description.

**Core Principle:** Clearly and concisely summarize what you did and why.

**Workflow:**
This protocol is triggered **after** you have successfully called \`commitToHead\`.

1.  **State Completion:** Start by clearly stating that the user's request is complete.
    -   *Example:* "I have finished your request to update the login form."

2.  **Provide a Summary of Changes:** Present a brief, bulleted list of the key changes you made.
    -   Focus on the *what*, not the *how*.
    -   Mention the files you modified.

3.  **Follow the Template:** You MUST use the following format:

    **Request Complete.**

    **Summary of Changes:**
    *   **Modified \`src/components/LoginForm.tsx\`:** Added a new 'password' input field and state management for it.
    *   **Updated \`src/App.tsx\`:** Imported and rendered the updated \`LoginForm\` component.
    *   **Modified \`style.css\`:** Added new styles for form input validation feedback.

4.  **Conclude:** End your message after the summary. Do not ask for the next task. Wait for the user to provide the next instruction.
`;

export default content;
