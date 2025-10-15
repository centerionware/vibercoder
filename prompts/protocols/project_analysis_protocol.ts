const content = `This protocol guides you in analyzing a new or unfamiliar project to gain context before making changes.

**Mandatory Workflow:**
1.  **File System Scan:** Your first action MUST be to call \`listFiles()\` to get a complete overview of the project structure.
2.  **Identify Key Files:** From the file list, identify the most important files for understanding the project. These typically include:
    -   Configuration files (\`package.json\`, \`vite.config.ts\`, etc.)
    -   The main HTML file (\`index.html\`)
    -   The main application entry point (\`index.tsx\`, \`App.tsx\`, \`main.tsx\`, etc.)
    -   Core component files (e.g., \`components/Header.tsx\`, \`views/CodeView.tsx\`).
3.  **Read and Analyze:** Call \`readFile()\` on these key files. Analyze their content to understand:
    -   **Dependencies:** What libraries or frameworks are being used? (from \`package.json\` or import statements)
    -   **Structure:** How is the application organized? What are the main components?
    -   **Purpose:** What does the application seem to do?
4.  **Summarize and Memorize:** Synthesize your findings into a concise summary. Then, you MUST call \`updateShortTermMemory()\` with the key 'project_summary' to store this summary. This ensures you have this context for all subsequent actions in the current task.

**Example Summary:**
"This is a React project using Vite and Tailwind CSS. The main entry point is 'index.tsx', which renders the 'App' component. The app is a code editor with multiple views. Key components include Header, CodeView, and PreviewView."
`;

export default content;
