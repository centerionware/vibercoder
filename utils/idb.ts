import Dexie, { Table } from 'dexie';
import { Project, ChatThread, GitCredential } from '../types';

export class VibeCodeDB extends Dexie {
  projects!: Table<Project>;
  threads!: Table<ChatThread>;
  gitCredentials!: Table<GitCredential>;

  constructor() {
    super('vibecodeDB');
    // Fix: Cast 'this' to 'any' to allow calling Dexie's 'version' method, resolving a TypeScript type error.
    (this as any).version(4).stores({
      projects: '++id, &name, gitSettings',
      threads: '++id, projectId',
      gitCredentials: '++id, name, isDefault',
    });
  }
}

export const db = new VibeCodeDB();

// Pre-populate with a default project if none exist
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
});