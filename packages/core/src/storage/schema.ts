// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Database Schema (Drizzle ORM)
// ═══════════════════════════════════════════════════════════
//
// SQLite tables for session persistence, message history,
// and agent state. Mirrors the OpenCode architecture with
// sessions, messages, and snapshot tracking.

import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

// ── Sessions Table ────────────────────────────────────────
// Each conversation is a session with a unique ID,
// linked to a specific LLM model and provider.
export const sessions = sqliteTable("sessions", {
  // Unique session identifier (ULID format)
  id: text("id").primaryKey().notNull(),

  // Auto-generated title from first user message
  title: text("title").default("Untitled Session"),

  // Parent session ID for subagent sessions (null = top-level)
  parentId: text("parent_id").references((): any => sessions.id, {
    onDelete: "cascade",
  }),

  // LLM configuration
  model: text("model").notNull().default(""),
  provider: text("provider").notNull().default(""),

  // Active agent type: "build" | "plan"
  activeAgent: text("active_agent").notNull().default("build"),

  // Session status: "active" | "idle" | "completed" | "error"
  status: text("status").notNull().default("idle"),

  // Multi-instance liveness detection
  heartbeatAt: text("heartbeat_at"),
  peerId: text("peer_id"),

  // Token usage tracking
  totalInputTokens: integer("total_input_tokens").notNull().default(0),
  totalOutputTokens: integer("total_output_tokens").notNull().default(0),
  totalCost: integer("total_cost").notNull().default(0), // in microdollars

  // Working directory for this session
  cwd: text("cwd"),

  // Timestamps
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ── Messages Table ────────────────────────────────────────
// Full message history: user prompts, assistant responses,
// tool calls, and tool results.
export const messages = sqliteTable("messages", {
  // Unique message identifier (ULID format)
  id: text("id").primaryKey().notNull(),

  // Foreign key to parent session
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),

  // Message role: "user" | "assistant" | "tool" | "system"
  role: text("role").notNull(),

  // Message content (text or JSON for tool calls/results)
  content: text("content").notNull().default(""),

  // For tool calls: the tool name
  toolName: text("tool_name"),

  // For tool calls: the tool call ID (links call to result)
  toolCallId: text("tool_call_id"),

  // For tool calls: serialized arguments (JSON)
  toolArgs: text("tool_args"),

  // For tool results: serialized result (JSON)
  toolResult: text("tool_result"),

  // Token usage for this specific message
  inputTokens: integer("input_tokens").default(0),
  outputTokens: integer("output_tokens").default(0),

  // Model that generated this message (for assistant messages)
  model: text("model"),

  // Duration of LLM call in milliseconds
  durationMs: integer("duration_ms"),

  // Message ordering within session
  orderIndex: integer("order_index").notNull().default(0),

  // Timestamps
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ── Snapshots Table ───────────────────────────────────────
// Git snapshots for undo/redo support.
// Before destructive operations, a snapshot is saved.
export const snapshots = sqliteTable("snapshots", {
  id: text("id").primaryKey().notNull(),

  // Which session created this snapshot
  sessionId: text("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),

  // Which message triggered the snapshot
  messageId: text("message_id").references(() => messages.id),

  // Git ref or stash identifier
  gitRef: text("git_ref").notNull(),

  // Snapshot type: "pre_edit" | "checkpoint" | "manual"
  type: text("type").notNull().default("pre_edit"),

  // Description of what was about to happen
  description: text("description"),

  // Timestamp
  createdAt: text("created_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ── Key-Value Config Table ────────────────────────────────
// Stores runtime state and preferences.
export const kvStore = sqliteTable("kv_store", {
  key: text("key").primaryKey().notNull(),
  value: text("value").notNull(),
  updatedAt: text("updated_at")
    .notNull()
    .$defaultFn(() => new Date().toISOString()),
});

// ── Type Exports ──────────────────────────────────────────
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Snapshot = typeof snapshots.$inferSelect;
export type NewSnapshot = typeof snapshots.$inferInsert;
