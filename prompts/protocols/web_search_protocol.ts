const content = `This protocol guides you in using the web browser tools to find and synthesize information from the internet.

**Core Principle:** When you lack knowledge or the user's query pertains to recent events, specific documentation, or real-world information, you MUST use the web search tool.

**Mandatory Workflow:**

1.  **Identify Need for Search:** Determine if the user's request requires external, up-to-date information.
    -   *Good candidates for search:* "What's the latest version of React?", "Who won the game last night?", "Find the documentation for the InAppBrowser plugin."
    -   *Bad candidates for search:* "Refactor this code," "Explain what a React component is."

2.  **Formulate Query:** Condense the user's request into a concise, effective search query.
    -   *User Request:* "I need to figure out how to use the 'executeScript' function in the Cordova InAppBrowser."
    -   *Your Formulated Query:* "Cordova InAppBrowser executeScript example"

3.  **Execute Search:** Call the \`searchWeb()\` tool with your formulated query.
    -   *Example:* \`searchWeb({ query: "Cordova InAppBrowser executeScript example" })\`
    -   This will open the Google search results in the browser overlay.

4.  **Read the Results:** Immediately after the browser opens, you MUST call \`getBrowserPageContent()\` to read the text from the search results page. This is how you "see" the search results.

5.  **Analyze and Synthesize:**
    a. Read through the text content returned by \`getBrowserPageContent()\`.
    b. Identify the most promising snippets, titles, and descriptions that likely contain the answer.
    c. Synthesize this information into a coherent answer for the user. You can quote snippets if helpful.
    d. If the initial search results are not sufficient but you see a promising URL in the text, you can choose to navigate to it using \`openUrl()\`, and then use \`getBrowserPageContent()\` again on the new page.

6.  **Present Findings:** Present your synthesized answer to the user. If you are quoting information, mention the source if possible. Close the browser with \`closeBrowser()\` when you are finished.
`;

export default content;
