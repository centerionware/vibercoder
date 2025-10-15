const content = `This protocol defines the standard file structure for creating new React components. You MUST follow this structure to keep the codebase organized and scalable.

**Core Principle:** Each non-trivial component should live in its own directory.

**Mandatory Workflow:**
When asked to create a new component (e.g., "a login form"):

1.  **Create Directory:** Create a new directory inside \`src/components/\` (or an appropriate subdirectory) named after the component in PascalCase.
    -   Example: \`src/components/LoginForm/\`

2.  **Create Component File:** Inside the new directory, create the main component file named \`LoginForm.tsx\`.
    -   This file should contain the React component logic.
    -   It should have a default export.
    \`\`\`tsx
    // src/components/LoginForm/LoginForm.tsx
    import React from 'react';
    
    const LoginForm = () => {
      // ... component logic ...
    };
    
    export default LoginForm;
    \`\`\`

3.  **Create Index File:** Inside the new directory, create an \`index.ts\` file.
    -   This file's purpose is to re-export the component, making imports cleaner.
    \`\`\`ts
    // src/components/LoginForm/index.ts
    export { default } from './LoginForm';
    \`\`\`

4.  **Usage:** When you need to use this new component elsewhere in the app, you can now import it cleanly from the directory.
    \`\`\`tsx
    // src/App.tsx
    import LoginForm from './components/LoginForm';
    
    // ...
    \`\`\`

**Exception:** For very small, single-use, or trivial components, it is acceptable to define them within the file where they are used, without creating a separate directory.
`;

export default content;
