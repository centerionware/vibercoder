import Dexie, { Table } from 'dexie';
import { ChatThread } from '../types';

// Safely initialize the database and capture any errors.
// This prevents top-level exceptions that would crash the app before React can render.

let dbInstance: (Dexie & { threads: Table<ChatThread> }) | null = null;
let initializationError: Error | null = null;

try {
  const db = new Dexie('VibeCodeDB') as Dexie & {
    threads: Table<ChatThread>;
  };
  
  // Define the schema.
  db.version(1).stores({
    threads: 'id, createdAt' // Primary key: 'id', Indexed property: 'createdAt'
  });

  dbInstance = db;
} catch (e) {
    console.error("Critical: Failed to initialize Dexie/IndexedDB.", e);
    initializationError = e instanceof Error ? e : new Error(String(e || 'Unknown IndexedDB initialization error'));
}

export const db = dbInstance;
export const dbInitializationError = initializationError;
