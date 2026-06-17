// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Storage Layer Exports
// ═══════════════════════════════════════════════════════════

// Schema & Types
export {
  sessions,
  messages,
  snapshots,
  kvStore,
} from "./schema.js";
export type {
  Session,
  NewSession,
  Message,
  NewMessage,
  Snapshot,
  NewSnapshot,
} from "./schema.js";

// Database Connection
export {
  createDatabase,
  createTestDatabase,
  resolveDatabasePath,
} from "./database.js";
export type { QuandCodeDB } from "./database.js";

// Storage Service
export { StorageService } from "./storage.js";

// ID Generation
export {
  generateId,
  generateSessionId,
  generateMessageId,
  generateSnapshotId,
} from "./id.js";
