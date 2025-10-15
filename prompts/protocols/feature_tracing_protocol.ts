const content = `This protocol is for understanding how an existing feature is implemented in the codebase before you modify it.

**Workflow:**
1.  **Initial Scan:** Call \`listFiles()\` to get a map of the entire project structure.
2.  **Identify Entry Points:** Based on the user's request (e.g., "change the header"), identify the most likely starting files. Good candidates are \`App.tsx\`, \`index.tsx\`, or component files with matching names (e.g., \`Header.tsx\`).
3.  **Code Walkthrough:**
    a. Call \`readFile()\` on your chosen entry point file.
    b. Follow the chain of \`import\` statements and component usages. For each relevant component or function you discover, call \`readFile()\` on its source file.
    c. Continue this process until you have a clear picture of the data flow and component hierarchy related to the feature.
4.  **Summarize & Memorize:** Use the \`think()\` tool to create a concise summary of your findings. The summary should include the key files, components, props, and state involved in the feature.
5.  **Store Context:** You MUST call \`updateShortTermMemory()\` with the key 'feature_trace_summary' and your summary as the value. This stores your understanding for the rest of the task.
6.  **Confirm Readiness:** Inform the user that you have analyzed the feature and are ready to proceed with their requested changes.
`;

export default content;
