const content = `This protocol provides a strict, step-by-step guide for creating a new React application from scratch. You MUST follow these steps exactly when a user asks to create a new app in an empty or new project.

**Mandatory Workflow:**

1.  **Create \`index.html\`:** Call \`createFile\` to create an \`index.html\` file. The content MUST be the standard VibeCode HTML boilerplate, including a root div and the Tailwind CSS CDN script.
    \`\`\`html
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>New AIDE App</title>
        <script src="https://cdn.tailwindcss.com"></script>
      </head>
      <body>
        <div id="root"></div>
      </body>
    </html>
    \`\`\`

2.  **Create \`style.css\`:** Call \`createFile\` to create a \`style.css\` file. The content should provide basic, theme-aligned body styles.
    \`\`\`css
    body {
      font-family: sans-serif;
      background-color: #1a1b26; /* vibe-bg */
      color: #c0caf5; /* vibe-text */
    }
    \`\`\`

3.  **Create \`index.tsx\`:** Call \`createFile\` to create the main application entry point, \`index.tsx\`. This file MUST import React, ReactDOM, and the new \`style.css\`. It should render a simple placeholder component based on the user's request into the 'root' div.

4.  **Finalize:** After creating all three files, you MUST call \`commitToHead\` to save the new application to the user's workspace.

5.  **Inform User:** Announce that the new application has been created and is ready to be viewed in the preview.
`;

export default content;