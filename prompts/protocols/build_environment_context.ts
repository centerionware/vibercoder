const content = `This protocol describes the VibeCode development environment. You MUST adhere to these rules when building or modifying applications.

**Core Architecture:**
- The application runs entirely in the browser. A bundler (esbuild-wasm) transpiles and bundles modern JavaScript (including JSX/TSX) on the fly.

**File Structure & Entry Point:**
- A standard project consists of an \`index.html\` file and a corresponding TypeScript entry point, typically \`index.tsx\`.
- The bundler's entry point is the \`.tsx\` file specified in the project settings. You can view this with the \`viewBuildEnvironment\` tool.
- The \`index.html\` file **MUST NOT** contain a \`<script type="module" src="...">\` tag pointing to the entry point. The bundler injects the compiled code into the preview iframe automatically.
- The HTML file's primary purpose is to provide the root DOM element (e.g., \`<div id="root"></div>\`) and include global assets like the Tailwind CSS script.

**Styling:**
- All styling **MUST** be done with Tailwind CSS utility classes.
- Classes can be applied directly in JSX.
- For more complex styling, a separate CSS file (e.g., \`style.css\`) can be created and imported into the main TSX file (e.g., \`import './style.css';\`).

**Correct \`index.html\` Example:**
\`\`\`html
<!DOCTYPE html>
<html>
  <head>
    <title>My App</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
\`\`\`

**Correct \`index.tsx\` Example:**
\`\`\`tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
// Optional CSS import
// import './style.css';

const App = () => (
  <h1 className="text-2xl font-bold text-blue-500">Hello World!</h1>
);

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
\`\`\`
`;

export default content;
