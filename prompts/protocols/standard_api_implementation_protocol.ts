const content = `This protocol provides the comprehensive technical guide for implementing standard, request-response interactions using the **Gemini API** (Non-Live) via the \`@google/genai\` SDK.

**1. Environment & Authentication**
*   **API Key:** You MUST access the API key via \`process.env.API_KEY\`.
*   **Initialization:**
    \`\`\`typescript
    import { GoogleGenAI } from "@google/genai";
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    \`\`\`

**2. Text Generation (Chat & Completions)**
*   **Model:** Use \`gemini-2.5-flash\` for speed/general tasks, or \`gemini-2.5-pro\` for complex reasoning.
*   **Streaming (Preferred):** Always prefer streaming for better UX.
    \`\`\`typescript
    const model = ai.models.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContentStream({ 
      contents: [{ role: 'user', parts: [{ text: "Write a story" }] }] 
    });
    
    for await (const chunk of result.stream) {
      const text = chunk.text(); // Display this incrementally
    }
    \`\`\`

**3. JSON / Structured Output**
If the user asks for data extraction or formatted output, use \`responseSchema\`.
*   **Configuration:**
    \`\`\`typescript
    import { SchemaType } from "@google/genai";
    
    const config = {
      responseMimeType: "application/json",
      responseSchema: {
        type: SchemaType.OBJECT,
        properties: {
          recipeName: { type: SchemaType.STRING },
          ingredients: { 
            type: SchemaType.ARRAY, 
            items: { type: SchemaType.STRING } 
          }
        }
      }
    };
    
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      config: config,
      contents: "Give me a cookie recipe"
    });
    
    const data = JSON.parse(result.response.text());
    \`\`\`

**4. Image Generation**
*   **Model:** Use \`imagen-3.0-generate-001\`.
*   **Method:**
    \`\`\`typescript
    const response = await ai.models.generateImages({
      model: 'imagen-3.0-generate-001',
      prompt: 'A futuristic robot painting a canvas',
      config: { numberOfImages: 1 }
    });
    
    // Access the base64 string
    const base64Image = response.generatedImages[0].image.imageBytes;
    const imgSrc = \`data:image/jpeg;base64,\${base64Image}\`;
    \`\`\`

**5. Vision (Image Analysis)**
To analyze user-uploaded images:
*   **Input:** Convert the file to a Base64 string.
*   **Request:**
    \`\`\`typescript
    const result = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [
            { text: "Describe this image" },
            { inlineData: { mimeType: "image/png", data: base64String } }
          ]
        }
      ]
    });
    \`\`\`

**6. Managing Context (Chat History)**
For chat applications, you must manually maintain the history array.
*   **Structure:** Array of \`{ role: 'user' | 'model', parts: [{ text: '...' }] }\`.
*   **Sending:** Pass the *entire* history array to \`generateContent\` (or use \`startChat\` helper) on every turn to maintain context.
`;

export default content;