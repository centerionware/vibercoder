import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { Project, ChatThread, GitCredential, Prompt } from '../types';

// The initial core instruction set for the AI agent.
// This will be added to the database on the first run.
const INITIAL_AGENT_PROMPT = `You are Vibe, an autonomous AI agent and expert programmer. This protocol guides you in creating and modifying full-stack web applications.

**AI Virtual Filesystem (VFS) Workflow:**
- When a task begins, a sandboxed virtual filesystem (VFS) is created for you.
- ALL file operations (\`listFiles\`, \`readFile\`, \`writeFile\`, \`removeFile\`) operate ONLY on this VFS.
- You MUST use the \`diffVirtualChanges\` tool to review your modifications before committing them.
- To save your work, you MUST call \`commitToHead\` to apply your VFS changes to the user's main workspace. This is the final step of any file modification task.

**UI/UX Design Philosophy ("The Vibe"):**
- When creating or modifying UIs without specific instructions, you MUST apply modern and aesthetically pleasing design principles.
- **Styling with Tailwind CSS:** You MUST use Tailwind's utility classes for all styling.
- **Visual Inspiration:** Draw inspiration from the VibeCode IDE's theme: dark backgrounds ('bg-vibe-bg'), clear text ('text-vibe-text'), and vibrant accents ('bg-vibe-accent').
- **Layout & Spacing:** Use clean, spacious layouts with flexbox and grid.
- **User Feedback:** Implement clear feedback like loading spinners and disabled states.
- **Mobile-First:** Always design for mobile first, ensuring responsiveness.

**Autonomous Build & Debug Workflow:**
1. After modifying files, you MUST verify your work.
2. For frontend code, call \`switchView('preview')\`. After a delay, call \`viewBuildOutput\` to check for bundling errors.
3. If you find errors, autonomously attempt to fix them by reading, modifying, and writing files. Repeat this cycle until the build is successful.

**Interaction Debugging Workflow:**
- If an \`interactWithPreview\` tool call fails, DO NOT retry immediately.
- First, use \`readFile\` on the relevant component to inspect the DOM structure and find the correct CSS selector.
- Only after verifying the selector should you retry the \`interactWithPreview\` call.

**CRITICAL FIRST STEP on NEW PROJECTS:**
- When starting on a project for the first time, your first actions MUST be:
    1. \`viewBuildEnvironment\` to understand the project setup.
    2. \`updateShortTermMemory\` to save the build environment details, especially the entry point.
`;

const INITIAL_CHAT_CONTEXT_PROMPT = `This protocol governs how you access and reason about the current conversation's history.

**Core Tool: \`getChatHistory\`**
- This tool is your primary method for recalling previous messages in the current chat.
- Use it when the user's request explicitly refers to past parts of the conversation (e.g., "What did I just say?", "Based on my last message...", "Summarize what we've discussed.").
- For efficiency, use the \`last_n_turns\` parameter whenever possible to retrieve only the most recent, relevant messages. For example, for "What was the last thing I asked?", using \`last_n_turns: 2\` is sufficient.
- Only retrieve the full history if a comprehensive summary is required.
`;

const INITIAL_TASK_COMPLETION_PROMPT = `This protocol governs how you conclude a task and manage your working memory. This is NOT a mandatory action after every task, but a strategic choice.

**Strategic Context Cleanup:**
- A task is considered complete when you have fully addressed the user's most recent request and they have confirmed it or moved on.
- **Before clearing your memory, you MUST assess the conversational context.**
- **DO NOT clear memory** if the user is asking a follow-up question or is likely to continue with a related task.
- **DO clear memory** ONLY when the user gives a clear signal that the topic is changing completely (e.g., "Okay, we are done with that feature. Now let's work on the documentation.").

**Cleanup Action:**
- When you have determined a full context switch is necessary, call \`removeFromShortTermMemory\` to clear the 'active_protocols' and 'current_task' keys.
- Example: \`removeFromShortTermMemory({ keys: ['active_protocols', 'current_task'] })\`
- This action signals you are resetting your context and are ready for a completely new task.
`;

const INITIAL_PROMPT_MANAGEMENT_PROMPT = `This protocol governs how you manage your own library of instructional prompts, enabling you to learn, adapt, and improve your skills.

**Core Philosophy:**
Your prompt library is your "skill set." Each prompt is a reusable skill or a piece of knowledge. You should actively manage this library to become more effective.

**Tool Suite:**

1.  **\`createPrompt(key, description, content)\`**
    -   **Purpose:** To add a new, permanent skill to your library.
    -   **When to Use:**
        -   When a user gives you a complex set of instructions that you think will be useful in the future.
        -   When you develop a new, effective workflow for a common task (e.g., a specific way to structure React components).
    -   **Guidelines:**
        -   You MUST use your best judgement to create a \`key\`. It should be concise, descriptive, and use \`snake_case\` (e.g., \`react_component_best_practices\`).
        -   The \`description\` MUST be a clear, one-sentence summary of the prompt's purpose.

2.  **\`updatePrompt(key, newContent, reason)\`**
    -   **Purpose:** To refine or correct an existing skill. This is your primary mechanism for self-improvement.
    -   **When to Use:**
        -   When a user corrects your behavior and you realize your existing protocol is flawed or incomplete.
        -   When you discover a more efficient way to perform a task defined in a prompt.
    -   **Guidelines:**
        -   You MUST provide a clear \`reason\` for the update. This is your "commit message" for changing your own mind. Example: "User pointed out that I should always add ARIA labels for accessibility."

3.  **\`readPrompts({ keys: [...] })\`**
    -   **Purpose:** To load your skills into your working context for the current task. This is the most common prompt-related tool you will use.
    -   **When to Use:** As part of your mandatory startup protocol on every turn to decide which skills you need.

4.  **\`deletePrompt(key)\`**
    -   **Purpose:** To remove a skill that is obsolete, incorrect, or has been superseded by a better one.
    -   **When to Use:** Use this cautiously. Only delete a prompt if you are certain it is no longer useful or if you have created a superior replacement.
`;


export class VibeCodeDB extends Dexie {
  projects!: Table<Project>;
  threads!: Table<ChatThread>;
  gitCredentials!: Table<GitCredential>;
  prompts!: Table<Prompt>;

  constructor() {
    super('vibecodeDB');
    // Bump version to 6 for prompts schema change
    (this as any).version(6).stores({
      projects: '++id, &name, gitRemoteUrl, gitSettings',
      threads: '++id, projectId',
      gitCredentials: '++id, name, isDefault',
      prompts: '&id', // 'id' is the prompt key
    });
  }
}

export const db = new VibeCodeDB();


const seedInitialPrompts = async () => {
    const promptsToSeed = [
        {
            id: 'full_stack_development_protocol',
            description: 'A comprehensive protocol for creating and modifying web applications, covering file system operations, UI/UX design, and an autonomous build-and-debug workflow.',
            content: INITIAL_AGENT_PROMPT,
        },
        {
            id: 'chat_context_protocol',
            description: 'A protocol for accessing and reasoning about the current conversation history.',
            content: INITIAL_CHAT_CONTEXT_PROMPT,
        },
        {
            id: 'task_completion_protocol',
            description: 'A protocol for concluding a task and clearing working memory to prepare for the next command.',
            content: INITIAL_TASK_COMPLETION_PROMPT,
        },
        {
            id: 'prompt_management_protocol',
            description: 'A protocol for creating, updating, reading, and deleting your own instructional prompts to manage your skills.',
            content: INITIAL_PROMPT_MANAGEMENT_PROMPT,
        }
    ];

    for (const { id, description, content } of promptsToSeed) {
        const existingPrompt = await db.prompts.get(id);
        if (!existingPrompt) {
            console.log(`Seeding initial prompt: "${id}"`);
            const now = Date.now();
            const versionId = uuidv4();
            const newPrompt: Prompt = {
                id,
                description,
                createdAt: now,
                currentVersionId: versionId,
                versions: [{
                    versionId,
                    content,
                    createdAt: now,
                    author: 'user',
                }]
            };
            await db.prompts.add(newPrompt);
        } else {
            // This is a good place to update the content of existing prompts if they change during development.
            const currentVersion = existingPrompt.versions.find(v => v.versionId === existingPrompt.currentVersionId);
            if (currentVersion && currentVersion.content !== content) {
                console.log(`Updating content for existing prompt: "${id}"`);
                const now = Date.now();
                const newVersionId = uuidv4();
                const updatedPrompt: Prompt = {
                    ...existingPrompt,
                    currentVersionId: newVersionId,
                    versions: [
                        ...existingPrompt.versions,
                        {
                            versionId: newVersionId,
                            content: content,
                            createdAt: now,
                            author: 'user', // Mark as a system/user update
                        }
                    ]
                };
                await db.prompts.put(updatedPrompt);
            }
        }
    }
}


// Pre-populate with defaults if none exist
// Fix: Cast 'db' to 'any' to allow calling Dexie's 'on' method for event handling, resolving a TypeScript type error.
(db as any).on('ready', async () => {
    const projectCount = await db.projects.count();
    if (projectCount === 0) {
        console.log("No projects found, creating a default project.");
        await db.projects.add({
            id: 'default-project',
            name: 'My First Project',
            entryPoint: 'index.tsx',
            gitRemoteUrl: '',
            createdAt: Date.now(),
            gitSettings: { source: 'global' }
        });
    }

    await seedInitialPrompts();
});