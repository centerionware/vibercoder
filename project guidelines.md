# VibeCode Project Guidelines

This document outlines the vision, architecture, and design principles for the VibeCode application.

## 1. Vision & Mission

VibeCode is a mobile-first, web-based coding platform designed for modern frontend development. Our mission is to provide a seamless, enjoyable, and powerful coding experience that runs entirely in the browser, with a focus on:

-   **Accessibility:** Code anytime, anywhere, on any device. The AI assistant should be able to control application features, like settings, to aid users.
-   **AI-Enhanced Productivity:** Leverage generative AI as a true multi-modal pair programmer to accelerate development, from writing code and generating creative assets to real-time voice collaboration.
-   **Simplicity:** A clean, intuitive, and aesthetically pleasing user interface that minimizes friction.
-   **Power:** Support for modern web frameworks (like React) with a live, in-browser build and preview system.

## 2. Core Features

-   **File System Management:** A simple file explorer to create, read, update, and delete files within the browser's state.
-   **Code Editor:** A responsive, mobile-friendly text area for code input.
-   **Live Preview:** An `iframe`-based preview that uses `esbuild-wasm` to bundle and run modern JavaScript applications (including JSX/TSX) on the fly. It also captures and displays runtime errors.
-   **AI Assistant (Gemini):**
    -   **Text Chat:** Standard chat-based interface for coding and creative assistance.
    -   **Voice Chat (Live API):** Real-time, spoken conversation with the AI. Speech is interruptible for natural turn-taking, and conversations are transcribed and saved to history.
    -   **Integrated Tools:** The AI can use tools via both text and voice commands.
        -   File System & Context: `listFiles`, `readFile`, `writeFile`, `removeFile`, `viewActiveFile`.
        -   Creative: `generateImage`, `generateVideo`.
        -   App Control (Accessibility): `viewSettings`, `updateSettings`.
        -   Memory & RAG: `searchChatHistory`.
        -   Debugging: `viewBuildOutput`.
    -   **Retrieval-Augmented Generation (RAG):** The AI can search its entire conversation history across all threads to find relevant context, effectively giving it a long-term memory of the project's history.
    -   **Autonomous Operation:** Proactively plans and executes multi-step tasks.
    -   **Optimized Context:** Uses history truncation to manage token usage in long conversations effectively.
    -   **Error Debugging:** Can debug runtime errors from the preview pane and can also diagnose build failures by inspecting logs with the `viewBuildOutput` tool.
-   **Git Integration (Conceptual):**
    -   View changed files.
    -   Commit changes.
    -   Push/Pull from a remote repository (future functionality).
-   **Settings:**
    -   Configure AI provider, model, and Git credentials.
    -   Import projects from Git.

## 3. Architecture

-   **Frontend:** Built with React and TypeScript.
-   **Styling:** Tailwind CSS with a custom "vibe" theme defined in `index.html`.
-   **In-Browser Bundler:** `esbuild-wasm` is used to transpile and bundle the user's code in a web worker. This enables support for JSX, TSX, and CSS imports without a server-side build step. Dependencies are fetched from CDNs like `esm.sh`.
-   **AI Integration:** The `@google/genai` SDK is used to communicate with the Gemini API. This includes both the standard `generateContent` for text-based chat and the `live.connect` API for real-time voice interaction.

## 4. UI/UX Philosophy ("The Vibe")

-   **Mobile-First:** All components must be designed to be fully functional and look great on small screens.
-   **Minimalist Aesthetic:** A dark, clean theme (`vibe-bg`, `vibe-panel`, `vibe-accent`) inspired by popular code editors. The focus should be on the code and the preview.
-   **Intuitive Navigation:** A fixed bottom navigation bar provides easy access to the five core views: Code, Preview, Git, AI, and Settings.
-   **Clear Feedback:**
    -   Loading states (e.g., "Bundling...", "Generating video...", "Listening...") are essential for asynchronous operations.
    -   Tool call status in the AI view provides transparency into the AI's actions.
    -   Errors (both build-time and run-time) are clearly displayed and actionable.

## 5. Code Conventions

-   **Component Structure:** Components are organized by view (`components/views`) and type (`components/icons`).
-   **State Management:** Core application state is managed in the `App.tsx` component using React hooks (`useState`, `useRef`, `useEffect`).
-   **Typing:** TypeScript is used throughout the application. Core types are centralized in `types.ts`.
-   **Gemini API Usage:** Adhere strictly to the official `@google/genai` guidelines. The API key is managed exclusively through `process.env.API_KEY` and should not be exposed in the UI.