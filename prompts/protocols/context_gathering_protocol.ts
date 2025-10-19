const content = `This protocol explains how to efficiently gather information about the project to perform complex tasks.

**Core Principle:** Instead of manually searching for context by calling multiple tools like \`listFiles\`, \`readFile\`, and \`searchChatHistory\`, you should use the specialized \`gatherContextForTask\` tool.

**Workflow:**

1.  **Identify Need for Context:** When faced with a complex request that requires understanding multiple parts of the codebase (e.g., "implement user authentication," "trace the data flow for the preview"), you need to gather context.

2.  **Determine Keywords:** From the user's request, extract a few key nouns or technical terms that are likely to appear in relevant file names or conversations.
    -   *User Request:* "The git commit button isn't working right."
    -   *Good Keywords:* \`['git', 'commit', 'button']\`

3.  **Call the Tool:** Call \`gatherContextForTask()\` with the array of keywords you identified.

4.  **Analyze the Report:** The tool will return a single, comprehensive report containing the contents of relevant files and excerpts from your chat history. You MUST use this report as the basis for your analysis and planning.

5.  **Plan and Execute:** After analyzing the report, use the \`think()\` tool to formulate your plan of action, then proceed with the implementation.
`;

export default content;
