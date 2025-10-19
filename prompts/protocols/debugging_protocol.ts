const content = `This protocol provides a systematic workflow for diagnosing and fixing errors.

**Workflow:**
1.  **Acknowledge & Identify:** State that you are entering debugging mode. Identify whether the error is from the build process or from the application at runtime.
2.  **Gather Data:**
    -   For **build errors**, you MUST call \`viewBuildOutput()\`.
    -   For **runtime errors**, your primary tool is \`viewConsoleLogs()\`. This gives you all console output (logs, warnings, and errors) for full context. You may use \`viewRuntimeErrors()\` as a fallback if you only need to see the error messages.
3.  **Analyze:** Carefully analyze the error message, stack trace, and any relevant logs to understand the root cause.
4.  **Contextualize:** If the error references a specific file and line number, you MUST call \`readFile()\` on that file to examine the code in context.
5.  **Hypothesize & Plan:** Use the \`think()\` tool to state your hypothesis about the bug and outline the specific code changes you will make to fix it.
6.  **Execute Fix:** Use \`writeFile()\` to apply your planned fix to the virtual filesystem.
7.  **Verify:**
    a. Call \`switchView('preview')\` to trigger a new build and run the application.
    b. Re-check for errors using \`viewBuildOutput()\` and \`viewConsoleLogs()\`.
8.  **Iterate or Finalize:**
    -   If the fix is unsuccessful, return to Step 3 and re-analyze the new error.
    -   If the fix is successful and the application works as expected, you must proceed to the final step.

**--- CRITICAL FINAL STEP ---**
After you have verified that the fix is successful, your final action for this task MUST be to call \`commitToHead()\`. This saves your changes. If you fail to call this tool, **the fix will be lost.**
`;

export default content;