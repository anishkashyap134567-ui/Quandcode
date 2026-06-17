// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Agent Orchestrator
// ═══════════════════════════════════════════════════════════
//
// High-level API that wires everything together:
// SessionManager + ProviderRegistry + ToolRegistry + AgentLoop
//
// Usage:
//   const agent = new Agent({ model: "claude-sonnet-4-20250514", provider: "anthropic" });
//   const result = await agent.run("Add authentication to the API");

import { SessionManager } from "../session/session.js";
import { createTestDatabase } from "../storage/database.js";
import { AgentLoop } from "./loop.js";
import type { AgentConfig, AgentEvents, AgentResult } from "./loop.js";
import type { GenerateResult } from "../provider/types.js";
import type { QuandCodeDB } from "../storage/database.js";

// ── Agent Options ─────────────────────────────────────────

export interface AgentOptions {
  /** LLM model to use */
  model: string;

  /** LLM provider */
  provider: string;

  /** Agent mode: "build" or "plan" */
  mode?: "build" | "plan";

  /** Working directory */
  cwd?: string;

  /** Auto-approve all permissions */
  autoApprove?: boolean;

  /** Max loop iterations */
  maxIterations?: number;

  /** Custom instructions */
  customInstructions?: string;

  /** Event callbacks (for TUI) */
  events?: AgentEvents;

  /** Custom LLM generate function (for testing/custom providers) */
  generateFn?: (opts: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    systemPrompt: string;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  }) => Promise<GenerateResult>;

  /** Inject existing database (for testing) */
  db?: QuandCodeDB;
}

// ── Agent Class ───────────────────────────────────────────

export class Agent {
  private sessionManager: SessionManager;
  private config: AgentConfig;
  private events: AgentEvents;
  private generateFn: NonNullable<AgentOptions["generateFn"]>;

  constructor(opts: AgentOptions) {
    // Create session manager
    if (opts.db) {
      this.sessionManager = SessionManager.fromDatabase(opts.db);
    } else {
      this.sessionManager = new SessionManager(opts.cwd);
    }

    // Build config
    this.config = {
      model: opts.model,
      provider: opts.provider,
      mode: opts.mode || "build",
      maxIterations: opts.maxIterations || 100,
      maxToolCallsPerTurn: 25,
      autoApprove: opts.autoApprove || false,
      cwd: opts.cwd || process.cwd(),
      customInstructions: opts.customInstructions,
    };

    this.events = opts.events || {};

    // Generate function (real provider or mock)
    this.generateFn = opts.generateFn || this.defaultGenerateFn.bind(this);
  }

  /**
   * Run the agent with a prompt.
   */
  async run(prompt: string, sessionId?: string): Promise<AgentResult> {
    const loop = new AgentLoop({
      sessionManager: this.sessionManager,
      config: this.config,
      events: this.events,
      generateFn: this.generateFn,
    });

    return loop.run(prompt, sessionId);
  }

  /**
   * Get the session manager (for session listing, etc.)
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Default generate function — routes to the singleton provider registry.
   */
  private async defaultGenerateFn(opts: any): Promise<GenerateResult> {
    const { getProviderRegistry } = await import("../provider/index.js");
    const registry = getProviderRegistry();
    return registry.generate({
      model: opts.model,
      messages: opts.messages,
      systemPrompt: opts.systemPrompt,
      tools: opts.tools,
    });
  }
}

// ── Test Helpers ──────────────────────────────────────────

/**
 * Create an Agent with a mock LLM for testing.
 * The mock generates scripted responses based on the conversation.
 */
export function createTestAgent(opts: {
  responses: Array<{
    content: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }>;
  }>;
  mode?: "build" | "plan";
  events?: AgentEvents;
  cwd?: string;
}): Agent {
  let callIndex = 0;
  const db = createTestDatabase();

  return new Agent({
    model: "test-model",
    provider: "test",
    mode: opts.mode || "build",
    autoApprove: true,
    cwd: opts.cwd || process.cwd(),
    events: opts.events,
    db,
    generateFn: async () => {
      const response = opts.responses[callIndex] || {
        content: "Done.",
        toolCalls: [],
      };
      callIndex++;

      return {
        content: response.content,
        toolCalls: response.toolCalls || [],
        usage: { inputTokens: 100, outputTokens: 50 },
        model: "test-model",
        provider: "test",
        durationMs: 100,
        finishReason: response.toolCalls?.length ? "tool_calls" : "stop",
      };
    },
  });
}
