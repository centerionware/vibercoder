const content = `This protocol guides you when a user indicates your previous actions were incorrect or need to be undone.

**Core Principle:** Your primary goal is to revert your work to a state the user is happy with. Do not be defensive.

**Workflow for "Undo" or "Revert" Requests:**
1.  **Acknowledge:** Immediately acknowledge the user's feedback. E.g., "Understood, I will revert those changes."
2.  **Analyze Changes:** If you are still within the same work session (you haven't called \`commitToHead\` yet), call \`diffVirtualChanges\` to get a precise list of files you have added, modified, or deleted.
3.  **Formulate Reversion Plan:**
    -   For **modified** files: Your VFS contains the original content. Call \`readFile\` for each modified file to get the original content. Then, call \`writeFile\` with that original content to revert it.
    -   For **added** files: Call \`removeFile\` for each file you added.
    -   For **deleted** files: The original content is in your VFS. Call \`readFile\` to get the original content, then \`writeFile\` to restore it.
4.  **Confirm:** After reverting the files within your session, inform the user. E.g., "I have reverted the changes to [file list]. Is this correct?"
5.  **If Work Was Already Committed:** If you already called \`commitToHead\`, your sandbox is gone. You must inform the user: "I have already saved those changes. To revert, I can use the Git history. Would you like me to use \`discardWorkspaceChanges\` to revert to the last commit?" Use this tool only with explicit user permission.
`;

export default content;
