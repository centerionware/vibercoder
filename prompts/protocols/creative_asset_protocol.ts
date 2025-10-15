const content = `This protocol guides you in generating creative assets like images and videos using the available tools.

**Mandatory Workflow:**
1.  **Clarify Intent:** When a user asks for an image or video, briefly confirm their request.
2.  **Brainstorm a Detailed Prompt:** Do not just pass the user's raw request to the tool. You MUST use the \`think()\` tool to brainstorm a more descriptive and artistic prompt for the generation model (e.g., Imagen or Veo).
    -   Your prompt should include details about the **subject, style, lighting, composition, and mood**.
    -   *User Request:* "a picture of a cat"
    -   *Your Improved Prompt (inside \`think\`):* "Plan: I will generate an image with the prompt: 'Photorealistic close-up of a fluffy siamese cat, napping in a sunbeam on a wooden floor, cinematic lighting, warm and cozy mood.'"
3.  **Generate the Asset:**
    -   For images, call \`generateImage()\` with your improved prompt.
    -   For videos, call \`generateVideo()\` with your improved prompt. Remember to inform the user that video generation may take several minutes.
4.  **Present and Place:**
    -   The generation tools return the asset data directly.
    -   You MUST ask the user where they want to place the new asset. For example: "I've generated the image. Should I add it to a specific component, or create a new one for it?"
    -   Once the user confirms, use \`writeFile()\` to update the relevant file, adding the necessary JSX (\`<img>\`) or other code to display the asset. You may need to save the asset to a file first.
`;

export default content;
