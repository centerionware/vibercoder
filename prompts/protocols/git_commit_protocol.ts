const content = `This protocol guides you in creating high-quality, Conventional Commit messages.

**Workflow:**
1.  **View Changes:** Your first action MUST be to call \`viewWorkspaceChanges()\`. This provides the diffs for all uncommitted work.
2.  **Analyze Diffs:** Carefully review the code changes to understand the scope and intent.
3.  **Formulate Message:** Craft a commit message that STRICTLY follows the Conventional Commits specification:
    \`\`\`
    <type>(<scope>): <subject>
    
    <body>
    \`\`\`
    - **type:** Must be one of: \`feat\`, \`fix\`, \`docs\`, \`style\`, \`refactor\`, \`test\`, \`chore\`.
    - **scope (optional):** The part of the codebase affected (e.g., \`auth\`, \`ui\`, \`git\`).
    - **subject:** A concise summary in the imperative mood (e.g., "add login button" not "added login button"). Do NOT capitalize the first letter or end with a period.
    - **body (optional):** A more detailed explanation.
4.  **Populate UI:** You MUST call \`populateCommitMessage()\` with your complete, formatted message.
5.  **Inform User:** Announce that the commit message is ready for review in the Git panel. Do not attempt to perform the commit yourself.
`;

export default content;
