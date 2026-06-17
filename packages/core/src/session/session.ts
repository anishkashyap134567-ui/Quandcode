// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Session Manager
// ═══════════════════════════════════════════════════════════
//
// High-level session lifecycle management.
// Sits on top of StorageService and adds:
// - Session creation with auto-configuration
// - Title generation from first user message
// - Message composition for LLM calls
// - Context window tracking
// - Session forking (copy to experiment)
// - Heartbeat management for multi-instance detection

import { StorageService } from "../storage/storage.js";
import { createDatabase } from "../storage/database.js";
import type { QuandCodeDB } from "../storage/database.js";
import type { Session, Message } from "../storage/schema.js";
import type { QuandCodeConfig } from "../config/config.js";

// ── Types ─────────────────────────────────────────────────

export type MessageRole = "user" | "assistant" | "tool" | "system";

export interface SessionCreateOptions {
  model?: string;
  provider?: string;
  title?: string;
  agent?: "build" | "plan";
  cwd?: string;
  parentId?: string;
}

export interface LLMMessage {
  role: MessageRole;
  content: string;
  toolCalls?: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  toolCallId?: string;
  toolResult?: unknown;
}

export interface SessionInfo {
  session: Session;
  messages: Message[];
  messageCount: number;
  totalTokens: {
    input: number;
    output: number;
    total: number;
  };
  costMicrodollars: number;
}

// ── Session Manager ───────────────────────────────────────
export class SessionManager {
  private storage: StorageService;
  private db: QuandCodeDB;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cwd?: string) {
    this.db = createDatabase(cwd);
    this.storage = new StorageService(this.db);
  }

  /**
   * Create from an existing database (for testing).
   */
  static fromDatabase(db: QuandCodeDB): SessionManager {
    const manager = Object.create(SessionManager.prototype) as SessionManager;
    manager.db = db;
    manager.storage = new StorageService(db);
    manager.heartbeatInterval = null;
    return manager;
  }

  /**
   * Get the underlying storage service.
   */
  getStorage(): StorageService {
    return this.storage;
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ SESSION LIFECYCLE
  // ╚═══════════════════════════════════════════════════════

  /**
   * Start a new session.
   */
  async startSession(opts: SessionCreateOptions = {}): Promise<Session> {
    const session = await this.storage.createSession({
      model: opts.model || "",
      provider: opts.provider || "",
      title: opts.title || "New Session",
      cwd: opts.cwd || process.cwd(),
      parentId: opts.parentId,
    });

    // Set the active agent
    if (opts.agent && opts.agent !== "build") {
      await this.storage.updateSession(session.id, {
        activeAgent: opts.agent,
      });
    }

    // Start heartbeat
    this.startHeartbeat(session.id);

    return (await this.storage.getSession(session.id))!;
  }

  /**
   * Resume an existing session.
   */
  async resumeSession(sessionId: string): Promise<Session | null> {
    const session = await this.storage.getSession(sessionId);
    if (!session) return null;

    // Reactivate the session
    await this.storage.updateSession(sessionId, { status: "active" });
    this.startHeartbeat(sessionId);

    return (await this.storage.getSession(sessionId))!;
  }

  /**
   * Get the most recent session (for --continue flag).
   */
  async getLastSession(): Promise<Session | null> {
    const sessions = await this.storage.listSessions(1);
    return sessions[0] || null;
  }

  /**
   * Fork a session — create a copy to experiment without
   * affecting the original.
   */
  async forkSession(
    sessionId: string,
    newTitle?: string
  ): Promise<Session | null> {
    const original = await this.storage.getSession(sessionId);
    if (!original) return null;

    // Create new session with same config
    const forked = await this.storage.createSession({
      model: original.model,
      provider: original.provider,
      title: newTitle || `Fork of: ${original.title}`,
      cwd: original.cwd || undefined,
    });

    // Copy all messages
    const messages = await this.storage.getSessionMessages(sessionId);
    for (const msg of messages) {
      await this.storage.appendMessage({
        sessionId: forked.id,
        role: msg.role as MessageRole,
        content: msg.content,
        toolName: msg.toolName || undefined,
        toolCallId: msg.toolCallId || undefined,
        toolArgs: msg.toolArgs || undefined,
        toolResult: msg.toolResult || undefined,
        inputTokens: msg.inputTokens || undefined,
        outputTokens: msg.outputTokens || undefined,
        model: msg.model || undefined,
        durationMs: msg.durationMs || undefined,
      });
    }

    return forked;
  }

  /**
   * Complete the current session.
   */
  async endSession(sessionId: string): Promise<void> {
    this.stopHeartbeat();
    await this.storage.completeSession(sessionId);
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ MESSAGE MANAGEMENT
  // ╚═══════════════════════════════════════════════════════

  /**
   * Add a user message to the session.
   * Auto-generates session title from first message.
   */
  async addUserMessage(
    sessionId: string,
    content: string
  ): Promise<Message> {
    const msg = await this.storage.appendMessage({
      sessionId,
      role: "user",
      content,
    });

    // Auto-generate title from first user message
    const count = await this.storage.countMessages(sessionId);
    if (count === 1) {
      const title = this.generateTitle(content);
      await this.storage.setSessionTitle(sessionId, title);
    }

    return msg;
  }

  /**
   * Add an assistant (LLM) response to the session.
   */
  async addAssistantMessage(
    sessionId: string,
    content: string,
    opts?: {
      model?: string;
      inputTokens?: number;
      outputTokens?: number;
      durationMs?: number;
    }
  ): Promise<Message> {
    const msg = await this.storage.appendMessage({
      sessionId,
      role: "assistant",
      content,
      model: opts?.model,
      inputTokens: opts?.inputTokens,
      outputTokens: opts?.outputTokens,
      durationMs: opts?.durationMs,
    });

    // Track token usage at session level
    if (opts?.inputTokens || opts?.outputTokens) {
      await this.storage.addTokenUsage(
        sessionId,
        opts?.inputTokens || 0,
        opts?.outputTokens || 0
      );
    }

    return msg;
  }

  /**
   * Add a tool call to the session.
   */
  async addToolCall(
    sessionId: string,
    toolName: string,
    toolCallId: string,
    args: Record<string, unknown>
  ): Promise<Message> {
    return await this.storage.appendMessage({
      sessionId,
      role: "assistant",
      content: "",
      toolName,
      toolCallId,
      toolArgs: JSON.stringify(args),
    });
  }

  /**
   * Add a tool result to the session.
   */
  async addToolResult(
    sessionId: string,
    toolCallId: string,
    result: unknown,
    isError: boolean = false
  ): Promise<Message> {
    return await this.storage.appendMessage({
      sessionId,
      role: "tool",
      content: typeof result === "string" ? result : JSON.stringify(result),
      toolCallId,
      toolResult: JSON.stringify({ success: !isError, data: result }),
    });
  }

  /**
   * Add a system message.
   */
  async addSystemMessage(
    sessionId: string,
    content: string
  ): Promise<Message> {
    return await this.storage.appendMessage({
      sessionId,
      role: "system",
      content,
    });
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ CONTEXT COMPOSITION (for LLM calls)
  // ╚═══════════════════════════════════════════════════════

  /**
   * Build the message array for an LLM call.
   * Converts stored messages into the format expected by providers.
   */
  async buildLLMMessages(sessionId: string): Promise<LLMMessage[]> {
    const messages = await this.storage.getSessionMessages(sessionId);

    return messages.map((msg) => {
      const llmMsg: LLMMessage = {
        role: msg.role as MessageRole,
        content: msg.content,
      };

      // Tool calls (from assistant)
      if (msg.toolName && msg.toolCallId && msg.toolArgs) {
        llmMsg.toolCalls = [
          {
            id: msg.toolCallId,
            name: msg.toolName,
            args: JSON.parse(msg.toolArgs),
          },
        ];
      }

      // Tool results
      if (msg.role === "tool" && msg.toolCallId) {
        llmMsg.toolCallId = msg.toolCallId;
        llmMsg.toolResult = msg.toolResult
          ? JSON.parse(msg.toolResult)
          : msg.content;
      }

      return llmMsg;
    });
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ SESSION INFO & QUERIES
  // ╚═══════════════════════════════════════════════════════

  /**
   * Get full session info with messages and stats.
   */
  async getSessionInfo(sessionId: string): Promise<SessionInfo | null> {
    const session = await this.storage.getSession(sessionId);
    if (!session) return null;

    const messages = await this.storage.getSessionMessages(sessionId);
    const messageCount = await this.storage.countMessages(sessionId);

    return {
      session,
      messages,
      messageCount,
      totalTokens: {
        input: session.totalInputTokens,
        output: session.totalOutputTokens,
        total: session.totalInputTokens + session.totalOutputTokens,
      },
      costMicrodollars: session.totalCost,
    };
  }

  /**
   * List all sessions.
   */
  async listSessions(limit?: number): Promise<Session[]> {
    return this.storage.listSessions(limit);
  }

  /**
   * Switch the active agent (Plan ↔ Build).
   */
  async switchAgent(
    sessionId: string,
    agent: "build" | "plan"
  ): Promise<void> {
    await this.storage.updateSession(sessionId, { activeAgent: agent });
  }

  /**
   * Delete a session.
   */
  async deleteSession(sessionId: string): Promise<void> {
    await this.storage.deleteSession(sessionId);
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ INTERNAL UTILITIES
  // ╚═══════════════════════════════════════════════════════

  /**
   * Generate a session title from the first user message.
   * Takes the first ~50 characters of the message.
   */
  private generateTitle(content: string): string {
    const cleaned = content.replace(/\n/g, " ").trim();
    if (cleaned.length <= 60) return cleaned;
    return cleaned.substring(0, 57) + "...";
  }

  /**
   * Start heartbeat interval for liveness detection.
   */
  private startHeartbeat(sessionId: string): void {
    this.stopHeartbeat();
    const peerId = `peer_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

    this.heartbeatInterval = setInterval(async () => {
      try {
        await this.storage.heartbeat(sessionId, peerId);
      } catch {
        // Silently ignore heartbeat errors
      }
    }, 5000); // Every 5 seconds
  }

  /**
   * Stop the heartbeat interval.
   */
  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
