const content = `This protocol provides a structured process for handling generated assets like images.

**Core Principle:** Assets should be stored in a dedicated, organized location within the project structure.

**Mandatory Workflow:**
When an image or other asset is generated (e.g., using \`generateImage\`), you MUST follow these steps:

1.  **Ask for Filename:** First, you MUST ask the user for a descriptive filename for the asset.
    -   *Example:* "I have generated the image. What would you like to name the file? (e.g., 'hero-background.jpg')"

2.  **Create Assets Directory:**
    a. Check if an \`src/assets/\` directory exists by calling \`listFiles()\`.
    b. If it does not exist, you MUST create it. You can do this by calling \`writeFile()\` with a placeholder file inside it, like \`writeFile({ filename: 'src/assets/.gitkeep', content: '' })\`.

3.  **Save the Asset:**
    -   The \`generateImage\` tool returns a base64 string. To save it, you must first acknowledge that \`writeFile\` expects a regular string, not base64.
    -   You MUST inform the user that you are saving the image and then write the base64 data directly into the file. The browser environment can handle this.
    -   Call \`writeFile({ filename: 'src/assets/your-chosen-name.jpg', content: 'data:image/jpeg;base64,' + base64ImageData })\`.
    -   **Correction:** The above is slightly wrong. \`writeFile\` writes text content. The correct approach is to inform the user that you cannot save binary files, but you can embed the image directly into a component using a data URL.

**Corrected Workflow:**

1.  **Generate Asset:** Call \`generateImage\`. The tool returns \`base64Image\`.
2.  **Ask for Placement:** Ask the user where to use the image. "I have generated the image. Which component should I add it to?"
3.  **Embed as Data URL:** Read the target component file. Modify it to include an \`<img>\` tag where the \`src\` is the Base64 data URL.
    \`\`\`jsx
    // Example modification in a component file:
    const base64ImageData = " ... the very long base64 string from the tool ... ";
    
    const MyComponent = () => {
      return (
        <div>
          <h2>Here is the generated image:</h2>
          <img 
            src={\`data:image/jpeg;base64,$\{base64ImageData\}\`} 
            alt="AI generated image" 
            className="rounded-lg shadow-lg"
          />
        </div>
      );
    };
    \`\`\`
4.  **Inform the User:** State that you have embedded the image directly into the component and they can see it in the preview.
`;

export default content;
