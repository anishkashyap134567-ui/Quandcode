// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Database Connection & Migration
// ═══════════════════════════════════════════════════════════
//
// Manages SQLite database lifecycle using Bun's native SQLite:
// - Connection initialization
// - Schema migration (auto-creates tables)
// - Database location resolution
//
// The database is stored at:
//   <project-root>/.quandcode/state/quandcode.db

import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import type { BunSQLiteDatabase } from "drizzle-orm/bun-sqlite";
import * as fs from "node:fs";
import * as path from "node:path";
import * as schema from "./schema.js";

// ── Types ─────────────────────────────────────────────────
export type QuandCodeDB = BunSQLiteDatabase<typeof schema>;

// ── Database Location ─────────────────────────────────────
/**
 * Resolves the database file path.
 * Creates the directory structure if it doesn't exist.
 *
 * Priority:
 * 1. QUANDCODE_DB_PATH env var (for testing)
 * 2. <cwd>/.quandcode/state/quandcode.db
 */
export function resolveDatabasePath(cwd: string = process.cwd()): string {
  // Allow override for testing
  if (process.env.QUANDCODE_DB_PATH) {
    return process.env.QUANDCODE_DB_PATH;
  }

  const dbDir = path.join(cwd, ".quandcode", "state");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  return path.join(dbDir, "quandcode.db");
}

// ── SQL Migration Statements ──────────────────────────────
const MIGRATIONS: string[] = [
  // Migration 001: Create core tables
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT DEFAULT 'Untitled Session',
    parent_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    model TEXT NOT NULL DEFAULT '',
    provider TEXT NOT NULL DEFAULT '',
    active_agent TEXT NOT NULL DEFAULT 'build',
    status TEXT NOT NULL DEFAULT 'idle',
    heartbeat_at TEXT,
    peer_id TEXT,
    total_input_tokens INTEGER NOT NULL DEFAULT 0,
    total_output_tokens INTEGER NOT NULL DEFAULT 0,
    total_cost INTEGER NOT NULL DEFAULT 0,
    cwd TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    tool_name TEXT,
    tool_call_id TEXT,
    tool_args TEXT,
    tool_result TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    model TEXT,
    duration_ms INTEGER,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS snapshots (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    message_id TEXT REFERENCES messages(id),
    git_ref TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'pre_edit',
    description TEXT,
    created_at TEXT NOT NULL
  )`,

  `CREATE TABLE IF NOT EXISTS kv_store (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,

  // Indexes for common queries
  `CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)`,
  `CREATE INDEX IF NOT EXISTS idx_messages_session_order ON messages(session_id, order_index)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_parent_id ON sessions(parent_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_updated_at ON sessions(updated_at)`,
  `CREATE INDEX IF NOT EXISTS idx_snapshots_session_id ON snapshots(session_id)`,

  // Migration version tracking
  `CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
  )`,
];

// ── Database Initialization ───────────────────────────────
/**
 * Creates a new database connection and runs migrations.
 *
 * @param cwd - Working directory (used to resolve DB path)
 * @returns Connected and migrated Drizzle database instance
 */
export function createDatabase(cwd?: string): QuandCodeDB {
  const dbPath = resolveDatabasePath(cwd);
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.exec("PRAGMA journal_mode = WAL");
  // Enable foreign key constraints
  sqlite.exec("PRAGMA foreign_keys = ON");
  // Improve write performance
  sqlite.exec("PRAGMA synchronous = NORMAL");

  // Run migrations
  runMigrations(sqlite);

  // Create Drizzle instance with schema
  const db = drizzle(sqlite, { schema });

  return db;
}

/**
 * Runs all pending migrations.
 * Uses CREATE IF NOT EXISTS so migrations are idempotent.
 */
function runMigrations(sqlite: Database): void {
  const transaction = sqlite.transaction(() => {
    for (const sql of MIGRATIONS) {
      sqlite.exec(sql);
    }
  });

  transaction();
}

/**
 * Creates an in-memory database (for testing).
 */
export function createTestDatabase(): QuandCodeDB {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA journal_mode = WAL");
  sqlite.exec("PRAGMA foreign_keys = ON");

  runMigrations(sqlite);

  return drizzle(sqlite, { schema });
}
