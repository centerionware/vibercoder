const content = `This protocol provides the comprehensive technical guide for implementing real-time, bidirectional voice and audio interactions using the **Gemini Live API** via the \`@google/genai\` SDK.

**1. Environment & Authentication**
*   **API Key:** You MUST access the API key via \`process.env.API_KEY\`.
*   **Initialization:**
    \`\`\`typescript
    import { GoogleGenAI } from "@google/genai";
    // Initialize the client
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    \`\`\`

**2. Connection Setup**
*   **Model:** You MUST use \`gemini-2.5-flash-native-audio-preview-09-2025\`.
*   **Method:** Use \`ai.live.connect()\`.
*   **Configuration:**
    \`\`\`typescript
    const config = {
      // 1. AUDIO ONLY:
      responseModalities: ['AUDIO'], 
      // 2. VOICE SELECTION: 'Puck', 'Charon', 'Kore', 'Fenrir', 'Zephyr'
      speechConfig: { 
        voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } } 
      },
      // 3. TRANSCRIPTION (Required for text processing/display):
      inputAudioTranscription: { model: "google_speech" }, 
      outputAudioTranscription: { model: "google_speech" }, 
    };
    \`\`\`

**3. Audio Input (The "Ears")**
*   **Format:** The API expects **Raw PCM, 16kHz, 1 channel (mono), Little-Endian 16-bit integer**.
*   **Browser Audio:** Browsers capture Float32 at variable sample rates (usually 44.1kHz or 48kHz). You MUST downsample and convert.
*   **Implementation Pattern:**
    \`\`\`typescript
    // 1. Setup Context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = audioContext.createMediaStreamSource(stream);
    
    // 2. Processor (Use ScriptProcessor for raw access)
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0); // Float32
        
        // 3. Convert Float32 to Int16 PCM
        const pcm16 = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
            // Clamp and scale
            const s = Math.max(-1, Math.min(1, inputData[i]));
            pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        
        // 4. Base64 Encode (Manual implementation required in browser)
        let binary = '';
        const bytes = new Uint8Array(pcm16.buffer);
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        const base64Data = btoa(binary);

        // 5. Send to API
        session.sendRealtimeInput({ 
            media: { mimeType: "audio/pcm;rate=16000", data: base64Data } 
        });
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination); // Necessary to keep processor alive
    \`\`\`

**4. Handling Responses (The "Brain" & "Mouth")**
The \`onmessage\` callback receives chunks. You must handle Audio and Text separately.

*   **Audio Output (Playback):**
    Received as Base64 PCM (24kHz). You must decode and play it.
    \`\`\`typescript
    // Check for audio data
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && !isMuted) {
        // Decode base64 to ArrayBuffer -> Float32 -> Play via AudioContext
        playPcmData(audioData); 
    }
    \`\`\`

*   **Text Output (Transcription):**
    Received via \`outputTranscription\`. Use this for subtitles or translation apps.
    \`\`\`typescript
    const text = message.serverContent?.outputTranscription?.text;
    if (text) {
        updateUI(text);
    }
    \`\`\`

**5. Use Case: Real-time Translation App**
If the user asks for a translation app where they *read* the translation but do *not* hear the AI speak:
1.  **System Instruction:** "You are a translator. Translate input to Spanish. Do not converse."
2.  **Audio Logic:** In \`onmessage\`, **IGNORE** the \`inlineData\` (Audio). Do NOT call \`playPcmData\`.
3.  **Text Logic:** In \`onmessage\`, capture \`outputTranscription.text\` and display it in the UI.

**6. Use Case: Voice Selector**
If the user asks for a voice selector:
1.  **State:** Maintain a state variable \`selectedVoice\` (default 'Zephyr').
2.  **Reconnection:** The Live API config is immutable per session. When the user changes the voice, you MUST:
    *   Call \`session.close()\`.
    *   Create a *new* session with the updated \`speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName\`.
`;

export default content;