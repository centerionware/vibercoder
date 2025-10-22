const content = `This protocol guides you in using the web browser tools to find, synthesize, and remember information from the internet.

**Core Principle:** When you lack knowledge or the user's query pertains to recent events, specific documentation, or real-world information, you MUST use this protocol.

**Mandatory Workflow:**

1.  **Identify Need for Search:** Determine if the user's request requires external, up-to-date information.
    -   *Good candidates for search:* "What's the latest version of React?", "Who won the game last night?", "Find the documentation for the InAppBrowser plugin."
    -   *Bad candidates for search:* "Refactor this code," "Explain what a React component is."

2.  **Formulate Query:** Condense the user's request into a concise, effective search query. Use the \`think\` tool to state your query.
    -   *User Request:* "I need to figure out how to use the 'executeScript' function in the Cordova InAppBrowser."
    -   *Your Thought:* "My search query will be: 'Cordova InAppBrowser executeScript example documentation'."

3.  **Execute Search:** Call the \`searchWeb()\` tool with your formulated query. This opens the search results in the browser overlay.

4.  **Read Search Results:** Immediately after the browser opens, you MUST call \`getBrowserPageContent()\` to read the text from the search results page. This is how you "see" the search results.

5.  **Analyze and Navigate:**
    a. Read through the text content returned by \`getBrowserPageContent()\`.
    b. Use the \`think\` tool to identify the most promising URL from the search snippets and state your choice. The best links are usually official documentation or highly-rated community posts.
    c. You MUST then call \`openUrl()\` with the single best URL you identified. This navigates the browser to the actual article or documentation page.

6.  **Read Article Content:** After the browser navigates to the new page, you MUST call \`getBrowserPageContent()\` again to read the full text of the article.

7.  **Synthesize and Memorize:**
    a. Analyze the detailed content from the article.
    b. Create a concise summary of the key findings or the answer to the user's question.
    c. You MUST call \`updateShortTermMemory()\` to save your summary. Use a descriptive key like \`'search_result_summary'\` or \`'api_documentation_notes'\`.

8.  **Present and Cleanup:**
    a. Present your synthesized answer to the user.
    b. After presenting the answer, you MUST call \`closeBrowser()\` to close the browser overlay and clean up the UI.
`;

export default content;
