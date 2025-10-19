const content = `This protocol provides a systematic workflow for diagnosing and fixing errors.

**Core Concept: The Virtual File System (VFS)**
All your file modifications (\`writeFile\`, \`removeFile\`) happen in a temporary, isolated session called the VFS. To test your changes or make them permanent, you MUST save them to the main workspace using the \`commitToHead()\` tool. The build process ONLY runs on the main workspace files.

**Workflow:**
1.  **Acknowledge & Identify:** State that you are entering debugging mode. Identify whether the error is from the build process or from the application at runtime.
2.  **Gather Data:**
    -   For **build errors**, you MUST call \`viewBuildOutput()\`.
    -   For **runtime errors**, your primary tool is \`viewConsoleLogs()\`.
3.  **Analyze:** Analyze the error message and stack trace to understand the root cause.
4.  **Contextualize:** If the error references a specific file, you MUST call \`readFile()\` on that file to examine the code in context.
5.  **Hypothesize & Plan:** Use the \`think()\` tool to state your hypothesis about the bug and outline the specific code changes you will make.
6.  **Execute Fix in VFS:** Use \`writeFile()\` to apply your planned fix. These changes are currently only in your virtual session.

7.  **CRITICAL - SAVE TO WORKSPACE:** To test your fix, you MUST now save your changes from the VFS to the main workspace. Call \`commitToHead()\`. This is the ONLY way the build system will see your fix.

8.  **Verify Build:**
    a. Call \`switchView('preview')\` to ensure the preview panel is active, which triggers a new build.
    b. Wait a moment, then call \`viewBuildOutput()\` to check the result of the new build.

9.  **Iterate or Finalize:**
    -   **If the build fails again:** Return to Step 3. Analyze the NEW build error. You may need to read more files or revise your hypothesis.
    -   **If the build succeeds:** The fix is complete. There is no need to call \`commitToHead\` again. Your task is done. Announce the successful fix to the user.
`;

export default content;