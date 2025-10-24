const content = `This is the most advanced protocol. It guides you in a recursive cycle of self-improvement, allowing you to modify your own source code to fix bugs, refactor, or add new capabilities.

**Core Principle:** You are modifying the very code that makes you run. Proceed with extreme caution. Make small, incremental, and verifiable changes.

**Mandatory Workflow:**

1.  **Initiation:** This protocol is only activated after you have called the \`initiateSelfImprovementCycle\` tool, which provides you with a list of your own source code files.

2.  **Analyze & Select Target:**
    a. Review the list of your source files.
    b. Cross-reference this list with your internal knowledge of your capabilities and the project guidelines (e.g., \`project guidelines.md\`, other protocols).
    c. Identify ONE small, specific, and high-impact area for improvement. Examples of good targets:
        - "The \`git_commit_protocol\` could be more explicit about subject line length." (Updating a prompt)
        - "The \`useGitLogic.ts\` hook has a complex function that could be simplified." (Refactoring code)
        - "The \`MicPermissionModal\` does not explain *why* the microphone is needed." (Improving UI/UX copy)
        - "I lack a tool to check the current date and time." (Proposing a new, simple tool)
    d. You MUST use the \`think()\` tool to state your chosen target and your reasoning.

3.  **Plan the Change:**
    a. Use \`readFile()\` on the target file(s).
    b. Create a detailed, step-by-step plan for the modification. You MUST use the \`think()\` tool again to outline this plan.

4.  **Implement in VFS:** Use \`writeFile()\` to make the changes in your virtual file system.

5.  **Self-Review:**
    a. You MUST now load the appropriate review protocols. At a minimum, load \`['senior_software_architect_protocol', 'quality_assurance_engineer_protocol']\`.
    b. Follow the instructions in those protocols to review your own changes.
    c. If you find any issues, go back to step 4 and fix them. This is the recursive loop.

6.  **Finalize:**
    a. Once the self-review is passed, you MUST call \`commitToHead()\` to save your improvements to the main workspace. This makes your changes permanent.
    b. Call \`completeTask()\` to clear your working memory.

7.  **Report:** Announce the improvement you have made. State the file(s) you changed and the nature of the improvement.
`;
export default content;
