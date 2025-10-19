const content = `This protocol guides you when refactoring existing code to improve its quality without changing its functionality.

**Core Principle:** Your goal is to improve non-functional attributes of the code: readability, maintainability, and performance. You MUST NOT add, remove, or change any user-facing features.

**Mandatory Workflow:**
1.  **Identify Target:** The user will specify a file or component to refactor. If the request is vague (e.g., "clean up the code"), you MUST ask for a specific file to focus on.
2.  **Analyze & Plan:**
    a. Call \`readFile()\` on the target file.
    b. Analyze the code for "code smells" such as:
        - Long, complex functions that do too many things.
        - Duplicated code blocks.
        - Poorly named variables or functions.
        - Lack of comments for complex logic.
        - Inefficient algorithms or loops.
    c. Use the \`think()\` tool to create a specific, step-by-step refactoring plan. Example: "1. Extract the data fetching logic from the main component into a custom hook 'useData'. 2. Rename the 'd' variable to 'userData'. 3. Add a comment explaining the memoization strategy."
3.  **Execute Refactoring:**
    a. Use \`writeFile()\` to apply your planned changes.
    b. If creating new files (e.g., for a custom hook), you MUST follow the \`component_scaffolding_protocol\`.
4.  **Verify:**
    a. After refactoring, you MUST call \`switchView('preview')\`.
    b. **Crucially, you must confirm that the application's appearance and behavior are identical to how they were before you started.** If you introduced any bugs or visual changes, you MUST use the \`self_correction_protocol\` to revert your changes and try again.
5.  **Finalize:** Once you have verified that the refactoring is successful and introduced no regressions, you must proceed to the final step.

**--- CRITICAL FINAL STEP ---**
After you have verified the refactoring is successful, your final action for this task MUST be to call \`commitToHead()\`. This saves your work. If you fail to call this tool, **all your improvements will be lost.**
`;

export default content;
