import Dexie, { Table } from 'dexie';
import { v4 as uuidv4 } from 'uuid';
import { Project, ChatThread, GitCredential, Prompt } from '../types';
import { defaultPrompts } from '../prompts/defaultPrompts';

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
    // This is now the single source of truth for default prompts
    const promptsToSeed = defaultPrompts;

    const allPromptIds = promptsToSeed.map(p => p.id);
    const existingDbPrompts = await db.prompts.toArray();

    // Delete old prompts that are no longer in the seed list
    for (const dbPrompt of existingDbPrompts) {
        if (!allPromptIds.includes(dbPrompt.id)) {
            console.log(`Deleting obsolete prompt: "${dbPrompt.id}"`);
            await db.prompts.delete(dbPrompt.id);
        }
    }

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