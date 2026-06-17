// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Agent Loop
// ═══════════════════════════════════════════════════════════
//
// The Plan-Act-Observe-Refine cycle — the beating heart
// of the agent. Each turn:
//
//  1. BUILD system prompt + message history
//  2. SEND to LLM with tool definitions
//  3. PARSE response (text + tool calls)
//  4. EXECUTE tool calls (with permission checks)
//  5. FEED results back, REPEAT until done
//
// The loop terminates when:
//  - The LLM responds with only text (no tool calls)
//  - Max iterations reached
//  - User cancels (abort signal)
//  - Fatal error

import { SessionManager } from "../session/session.js";
import { buildSystemPrompt } from "../session/system.js";
import { ToolRegistry } from "../tool/registry.js";
import { PermissionManager } from "../tool/permissions.js";
import { registerCoreTools } from "../tool/tools/index.js";
import type { ToolCall, ToolCallResult, ToolContext } from "../tool/types.js";
import type { GenerateResult, LLMProvider } from "../provider/types.js";
import type { ProviderRegistry } from "../provider/registry.js";
import type { Session, Message } from "../storage/schema.js";

// ── Agent Configuration ───────────────────────────────────

export interface AgentConfig {
  /** LLM model to use */
  model: string;

  /** LLM provider */
  provider: string;

  /** Agent mode: "build" (full access) or "plan" (read-only) */
  mode: "build" | "plan";

  /** Max agent loop iterations (safety limit) */
  maxIterations: number;

  /** Max tool calls per single LLM response */
  maxToolCallsPerTurn: number;

  /** Custom system prompt instructions */
  customInstructions?: string;

  /** Auto-approve all tool permissions (--yes flag) */
  autoApprove: boolean;

  /** Working directory */
  cwd: string;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export const DEFAULT_AGENT_CONFIG: Partial<AgentConfig> = {
  mode: "build",
  maxIterations: 100,
  maxToolCallsPerTurn: 25,
  autoApprove: false,
};

// ── Agent Events ──────────────────────────────────────────
// Callbacks for observing the agent loop externally (TUI, logging)

export interface AgentEvents {
  /** Called when the agent starts processing */
  onStart?: (session: Session) => void;

  /** Called when sending a request to the LLM */
  onLLMRequest?: (iteration: number, messageCount: number) => void;

  /** Called when receiving text from the LLM */
  onLLMText?: (text: string, iteration: number) => void;

  /** Called when the LLM requests tool calls */
  onToolCalls?: (calls: ToolCall[], iteration: number) => void;

  /** Called when a tool execution completes */
  onToolResult?: (result: ToolCallResult, iteration: number) => void;

  /** Called on each streaming text chunk (for live TUI) */
  onStreamChunk?: (text: string) => void;

  /** Called when the agent finishes */
  onComplete?: (result: AgentResult) => void;

  /** Called on error */
  onError?: (error: Error) => void;

  /** Called when agent switches mode (plan ↔ build) */
  onModeSwitch?: (newMode: "build" | "plan") => void;

  /** Called when asking user for permission */
  onPermissionRequest?: (toolName: string, description: string) => Promise<boolean>;
}

// ── Agent Result ──────────────────────────────────────────

export interface AgentResult {
  /** Final text response from the agent */
  response: string;

  /** Session ID */
  sessionId: string;

  /** Total iterations executed */
  iterations: number;

  /** Total tool calls executed */
  toolCallCount: number;

  /** Total tokens used */
  totalTokens: {
    input: number;
    output: number;
  };

  /** Total cost in microdollars */
  costMicrodollars: number;

  /** Duration of the entire loop in milliseconds */
  durationMs: number;

  /** How the loop terminated */
  finishReason: "complete" | "max_iterations" | "cancelled" | "error";

  /** Error message if finishReason is "error" */
  error?: string;
}

// ── Agent Loop Class ──────────────────────────────────────

export class AgentLoop {
  private sessionManager: SessionManager;
  private toolRegistry: ToolRegistry;
  private permissionManager: PermissionManager;
  private config: AgentConfig;
  private events: AgentEvents;

  // State
  private currentIteration = 0;
  private totalToolCalls = 0;
  private totalInputTokens = 0;
  private totalOutputTokens = 0;
  private cancelled = false;

  // Provider (injected for generate calls)
  private generateFn: (opts: {
    model: string;
    messages: Array<{ role: string; content: string }>;
    systemPrompt: string;
    tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>;
  }) => Promise<GenerateResult>;

  constructor(opts: {
    sessionManager: SessionManager;
    config: AgentConfig;
    events?: AgentEvents;
    generateFn: typeof AgentLoop.prototype.generateFn;
  }) {
    this.sessionManager = opts.sessionManager;
    this.config = { ...DEFAULT_AGENT_CONFIG, ...opts.config } as AgentConfig;
    this.events = opts.events || {};
    this.generateFn = opts.generateFn;

    // Setup permission manager
    this.permissionManager = new PermissionManager({
      autoApprove: this.config.autoApprove,
      askCallback: this.events.onPermissionRequest
        ? (q) => this.events.onPermissionRequest!(q.split('"')[1] || "unknown", q)
        : undefined,
    });

    // Setup tool registry with core tools
    this.toolRegistry = new ToolRegistry(this.permissionManager);
    registerCoreTools(this.toolRegistry);

    // Listen for abort signal
    if (this.config.signal) {
      this.config.signal.addEventListener("abort", () => {
        this.cancelled = true;
      });
    }
  }

  /**
   * Get the tool registry (for registering custom tools).
   */
  getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ MAIN LOOP
  // ╚═══════════════════════════════════════════════════════

  /**
   * Run the agent loop for a given prompt.
   *
   * Creates or resumes a session, then enters the
   * Plan-Act-Observe-Refine cycle.
   */
  async run(prompt: string, sessionId?: string): Promise<AgentResult> {
    const startTime = Date.now();
    this.currentIteration = 0;
    this.totalToolCalls = 0;
    this.totalInputTokens = 0;
    this.totalOutputTokens = 0;
    this.cancelled = false;

    let session: Session;
    let lastResponse = "";

    try {
      // ── Start or resume session ─────────────────────────
      if (sessionId) {
        const existing = await this.sessionManager.resumeSession(sessionId);
        if (!existing) {
          return this.makeResult("error", startTime, lastResponse, `Session not found: ${sessionId}`);
        }
        session = existing;
      } else {
        session = await this.sessionManager.startSession({
          model: this.config.model,
          provider: this.config.provider,
          agent: this.config.mode,
          cwd: this.config.cwd,
        });
      }

      this.events.onStart?.(session);

      // ── Add user message ────────────────────────────────
      await this.sessionManager.addUserMessage(session.id, prompt);

      // ── Build system prompt ─────────────────────────────
      const systemPrompt = buildSystemPrompt({
        modelId: this.config.model,
        provider: this.config.provider,
        cwd: this.config.cwd,
        agentMode: this.config.mode,
        customInstructions: this.config.customInstructions,
        tools: this.toolRegistry
          .listAvailable(this.config.mode)
          .map((t) => ({
            name: t.name,
            description: t.description,
            parameters: JSON.stringify({}),
          })),
      });

      // ── Agent Loop ──────────────────────────────────────
      while (this.currentIteration < this.config.maxIterations) {
        if (this.cancelled) {
          return this.makeResult("cancelled", startTime, lastResponse);
        }

        this.currentIteration++;

        // 1. BUILD messages for LLM
        const llmMessages = await this.sessionManager.buildLLMMessages(session.id);
        const formattedMessages = llmMessages.map((m) => ({
          role: m.role,
          content: m.content,
          toolCalls: m.toolCalls,
          toolCallId: m.toolCallId,
          toolResult: m.toolResult,
        }));

        this.events.onLLMRequest?.(this.currentIteration, formattedMessages.length);

        // 2. SEND to LLM
        const toolSchemas = this.toolRegistry.generateToolSchemas(this.config.mode);
        let llmResult: GenerateResult;

        try {
          llmResult = await this.generateFn({
            model: this.config.model,
            messages: formattedMessages,
            systemPrompt,
            tools: toolSchemas,
          });
        } catch (err) {
          const errorMsg = `LLM call failed: ${(err as Error).message}`;
          this.events.onError?.(err as Error);
          return this.makeResult("error", startTime, lastResponse, errorMsg);
        }

        // Track tokens
        this.totalInputTokens += llmResult.usage.inputTokens;
        this.totalOutputTokens += llmResult.usage.outputTokens;

        // 3. OBSERVE response
        const hasText = llmResult.content.trim().length > 0;
        const hasToolCalls = llmResult.toolCalls.length > 0;

        // Record assistant message
        if (hasText) {
          lastResponse = llmResult.content;
          await this.sessionManager.addAssistantMessage(session.id, llmResult.content, {
            model: llmResult.model,
            inputTokens: llmResult.usage.inputTokens,
            outputTokens: llmResult.usage.outputTokens,
            durationMs: llmResult.durationMs,
          });
          this.events.onLLMText?.(llmResult.content, this.currentIteration);
        }

        // 4. If no tool calls, we're DONE
        if (!hasToolCalls) {
          await this.sessionManager.endSession(session.id);
          return this.makeResult("complete", startTime, lastResponse);
        }

        // 5. ACT — execute tool calls
        const toolCalls: ToolCall[] = llmResult.toolCalls.map((tc) => ({
          id: tc.id,
          name: tc.name,
          rawArgs: tc.args,
        }));

        // Enforce max tool calls per turn
        const limitedCalls = toolCalls.slice(0, this.config.maxToolCallsPerTurn);
        this.events.onToolCalls?.(limitedCalls, this.currentIteration);

        // Build tool context
        const toolContext: ToolContext = {
          cwd: this.config.cwd,
          sessionId: session.id,
          agentMode: this.config.mode,
          checkPermission: (name) => this.permissionManager.checkPermission(name),
        };

        // Execute tools
        const results = await this.toolRegistry.executeToolCalls(limitedCalls, toolContext);

        // 6. REFINE — record tool calls and results
        for (const result of results) {
          this.totalToolCalls++;

          // Record tool call
          const originalCall = limitedCalls.find((c) => c.id === result.callId);
          if (originalCall) {
            await this.sessionManager.addToolCall(
              session.id,
              result.name,
              result.callId,
              originalCall.rawArgs
            );
          }

          // Record tool result
          await this.sessionManager.addToolResult(
            session.id,
            result.callId,
            result.result.success
              ? result.result.output
              : `Error: ${result.result.error}`,
            !result.result.success
          );

          this.events.onToolResult?.(result, this.currentIteration);

          // Handle agent mode switch
          const toolData = result.result.data as any;
          if (result.result.success && toolData?.action === "switch_mode") {
            const newMode = toolData.newMode as "build" | "plan";
            await this.switchMode(session.id, newMode);
          }
        }

        // Loop continues — next iteration sends results back to LLM
      }

      // Max iterations reached
      return this.makeResult("max_iterations", startTime, lastResponse);

    } catch (err) {
      this.events.onError?.(err as Error);
      return this.makeResult("error", startTime, lastResponse, (err as Error).message);
    }
  }

  /**
   * Cancel the running loop.
   */
  cancel(): void {
    this.cancelled = true;
  }

  /**
   * Switch agent mode mid-loop (Plan ↔ Build).
   */
  async switchMode(sessionId: string, newMode: "build" | "plan"): Promise<void> {
    this.config.mode = newMode;
    await this.sessionManager.switchAgent(sessionId, newMode);
    this.events.onModeSwitch?.(newMode);
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ INTERNAL
  // ╚═══════════════════════════════════════════════════════

  private makeResult(
    finishReason: AgentResult["finishReason"],
    startTime: number,
    response: string,
    error?: string
  ): AgentResult {
    const result: AgentResult = {
      response,
      sessionId: "",
      iterations: this.currentIteration,
      toolCallCount: this.totalToolCalls,
      totalTokens: {
        input: this.totalInputTokens,
        output: this.totalOutputTokens,
      },
      costMicrodollars: 0,
      durationMs: Date.now() - startTime,
      finishReason,
      error,
    };

    this.events.onComplete?.(result);
    return result;
  }
}
