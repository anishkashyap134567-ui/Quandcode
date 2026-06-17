// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Storage Service
// ═══════════════════════════════════════════════════════════
//
// Central CRUD service for sessions, messages, and snapshots.
// Wraps Drizzle ORM queries with a clean, typed API.
//
// Architecture: This mirrors OpenCode's Effect-TS service
// pattern but uses plain TypeScript classes for simplicity.

import { eq, desc, isNull, and, sql, asc } from "drizzle-orm";
import { sessions, messages, snapshots, kvStore } from "./schema.js";
import { generateSessionId, generateMessageId, generateSnapshotId } from "./id.js";
import type { QuandCodeDB } from "./database.js";
import type {
  Session,
  NewSession,
  Message,
  NewMessage,
  Snapshot,
  NewSnapshot,
} from "./schema.js";

// ── Storage Service ───────────────────────────────────────
export class StorageService {
  constructor(private db: QuandCodeDB) {}

  // ╔═══════════════════════════════════════════════════════
  // ║ SESSION OPERATIONS
  // ╚═══════════════════════════════════════════════════════

  /**
   * Create a new session.
   */
  async createSession(opts: {
    model?: string;
    provider?: string;
    title?: string;
    parentId?: string;
    cwd?: string;
  }): Promise<Session> {
    const id = generateSessionId();
    const now = new Date().toISOString();

    const newSession: NewSession = {
      id,
      title: opts.title || "Untitled Session",
      model: opts.model || "",
      provider: opts.provider || "",
      parentId: opts.parentId || null,
      cwd: opts.cwd || process.cwd(),
      status: "active",
      activeAgent: "build",
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(sessions).values(newSession);
    return this.getSession(id) as Promise<Session>;
  }

  /**
   * Get a session by ID.
   */
  async getSession(id: string): Promise<Session | null> {
    const results = await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.id, id))
      .limit(1);

    return results[0] || null;
  }

  /**
   * List all top-level sessions (no subagent sessions).
   * Ordered by most recently updated.
   */
  async listSessions(limit: number = 50): Promise<Session[]> {
    return await this.db
      .select()
      .from(sessions)
      .where(isNull(sessions.parentId))
      .orderBy(desc(sessions.updatedAt))
      .limit(limit);
  }

  /**
   * List child sessions (subagent sessions) for a parent.
   */
  async listChildSessions(parentId: string): Promise<Session[]> {
    return await this.db
      .select()
      .from(sessions)
      .where(eq(sessions.parentId, parentId))
      .orderBy(desc(sessions.createdAt));
  }

  /**
   * Update session fields.
   */
  async updateSession(
    id: string,
    updates: Partial<
      Pick<
        Session,
        | "title"
        | "model"
        | "provider"
        | "activeAgent"
        | "status"
        | "heartbeatAt"
        | "peerId"
        | "totalInputTokens"
        | "totalOutputTokens"
        | "totalCost"
      >
    >
  ): Promise<Session | null> {
    await this.db
      .update(sessions)
      .set({
        ...updates,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sessions.id, id));

    return this.getSession(id);
  }

  /**
   * Update session title (auto-generated from first user message).
   */
  async setSessionTitle(id: string, title: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        title,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sessions.id, id));
  }

  /**
   * Mark session as completed.
   */
  async completeSession(id: string): Promise<void> {
    await this.updateSession(id, { status: "completed" });
  }

  /**
   * Update heartbeat for liveness detection.
   */
  async heartbeat(id: string, peerId?: string): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        heartbeatAt: new Date().toISOString(),
        peerId: peerId || null,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sessions.id, id));
  }

  /**
   * Delete a session and all its messages (cascade).
   */
  async deleteSession(id: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.id, id));
  }

  /**
   * Add token usage to session totals.
   */
  async addTokenUsage(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    cost: number = 0
  ): Promise<void> {
    await this.db
      .update(sessions)
      .set({
        totalInputTokens: sql`${sessions.totalInputTokens} + ${inputTokens}`,
        totalOutputTokens: sql`${sessions.totalOutputTokens} + ${outputTokens}`,
        totalCost: sql`${sessions.totalCost} + ${cost}`,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(sessions.id, sessionId));
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ MESSAGE OPERATIONS
  // ╚═══════════════════════════════════════════════════════

  /**
   * Append a message to a session's history.
   */
  async appendMessage(opts: {
    sessionId: string;
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    toolName?: string;
    toolCallId?: string;
    toolArgs?: string;
    toolResult?: string;
    inputTokens?: number;
    outputTokens?: number;
    model?: string;
    durationMs?: number;
  }): Promise<Message> {
    const id = generateMessageId();

    // Get next order index for this session
    const lastMessage = await this.db
      .select({ maxOrder: sql<number>`MAX(${messages.orderIndex})` })
      .from(messages)
      .where(eq(messages.sessionId, opts.sessionId));

    const nextOrder = (lastMessage[0]?.maxOrder ?? -1) + 1;

    const newMessage: NewMessage = {
      id,
      sessionId: opts.sessionId,
      role: opts.role,
      content: opts.content,
      toolName: opts.toolName || null,
      toolCallId: opts.toolCallId || null,
      toolArgs: opts.toolArgs || null,
      toolResult: opts.toolResult || null,
      inputTokens: opts.inputTokens || 0,
      outputTokens: opts.outputTokens || 0,
      model: opts.model || null,
      durationMs: opts.durationMs || null,
      orderIndex: nextOrder,
      createdAt: new Date().toISOString(),
    };

    await this.db.insert(messages).values(newMessage);

    // Update session's updatedAt timestamp
    await this.db
      .update(sessions)
      .set({ updatedAt: new Date().toISOString() })
      .where(eq(sessions.id, opts.sessionId));

    return this.getMessage(id) as Promise<Message>;
  }

  /**
   * Get a message by ID.
   */
  async getMessage(id: string): Promise<Message | null> {
    const results = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, id))
      .limit(1);

    return results[0] || null;
  }

  /**
   * Get all messages for a session, ordered by creation.
   */
  async getSessionMessages(sessionId: string): Promise<Message[]> {
    return await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(asc(messages.orderIndex));
  }

  /**
   * Get the last N messages from a session (for context window management).
   */
  async getRecentMessages(
    sessionId: string,
    limit: number = 20
  ): Promise<Message[]> {
    const results = await this.db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, sessionId))
      .orderBy(desc(messages.orderIndex))
      .limit(limit);

    // Return in chronological order
    return results.reverse();
  }

  /**
   * Count messages in a session.
   */
  async countMessages(sessionId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(messages)
      .where(eq(messages.sessionId, sessionId));

    return result[0]?.count || 0;
  }

  /**
   * Delete a specific message.
   */
  async deleteMessage(id: string): Promise<void> {
    await this.db.delete(messages).where(eq(messages.id, id));
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ SNAPSHOT OPERATIONS (Undo/Redo)
  // ╚═══════════════════════════════════════════════════════

  /**
   * Create a snapshot (for undo/redo support).
   */
  async createSnapshot(opts: {
    sessionId: string;
    messageId?: string;
    gitRef: string;
    type?: "pre_edit" | "checkpoint" | "manual";
    description?: string;
  }): Promise<Snapshot> {
    const id = generateSnapshotId();

    const newSnapshot: NewSnapshot = {
      id,
      sessionId: opts.sessionId,
      messageId: opts.messageId || null,
      gitRef: opts.gitRef,
      type: opts.type || "pre_edit",
      description: opts.description || null,
      createdAt: new Date().toISOString(),
    };

    await this.db.insert(snapshots).values(newSnapshot);

    const results = await this.db
      .select()
      .from(snapshots)
      .where(eq(snapshots.id, id))
      .limit(1);

    return results[0]!;
  }

  /**
   * Get snapshots for a session.
   */
  async getSessionSnapshots(sessionId: string): Promise<Snapshot[]> {
    return await this.db
      .select()
      .from(snapshots)
      .where(eq(snapshots.sessionId, sessionId))
      .orderBy(desc(snapshots.createdAt));
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ KEY-VALUE STORE
  // ╚═══════════════════════════════════════════════════════

  /**
   * Set a key-value pair.
   */
  async kvSet(key: string, value: string): Promise<void> {
    await this.db
      .insert(kvStore)
      .values({
        key,
        value,
        updatedAt: new Date().toISOString(),
      })
      .onConflictDoUpdate({
        target: kvStore.key,
        set: {
          value,
          updatedAt: new Date().toISOString(),
        },
      });
  }

  /**
   * Get a value by key.
   */
  async kvGet(key: string): Promise<string | null> {
    const results = await this.db
      .select()
      .from(kvStore)
      .where(eq(kvStore.key, key))
      .limit(1);

    return results[0]?.value || null;
  }

  /**
   * Delete a key-value pair.
   */
  async kvDelete(key: string): Promise<void> {
    await this.db.delete(kvStore).where(eq(kvStore.key, key));
  }
}
