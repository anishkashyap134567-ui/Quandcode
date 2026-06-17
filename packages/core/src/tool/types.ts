// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Tool System Types
// ═══════════════════════════════════════════════════════════
//
// Defines the contract every tool must implement.
// Tools are the agent's hands — they interact with the
// filesystem, run commands, search code, and more.

import { z } from "zod";

// ── Permission Levels ─────────────────────────────────────

export type PermissionLevel = "allow" | "ask" | "deny";

// ── Tool Execution Result ─────────────────────────────────

export interface ToolResult {
  /** Whether the tool executed successfully */
  success: boolean;

  /** Human-readable output (shown to LLM) */
  output: string;

  /** Structured data (for internal processing) */
  data?: unknown;

  /** Error message if failed */
  error?: string;

  /** Execution time in milliseconds */
  durationMs?: number;
}

// ── Tool Definition ───────────────────────────────────────

export interface ToolDefinition<TArgs extends z.ZodType = z.ZodType> {
  /** Unique tool name (e.g., "file_read", "bash", "edit") */
  name: string;

  /** Human-readable description (injected into system prompt) */
  description: string;

  /** Detailed usage instructions (from .txt files) */
  longDescription?: string;

  /** Zod schema for input validation */
  parameters: TArgs;

  /** Tool category for organization */
  category: ToolCategory;

  /** Can this tool run concurrently with other tools? */
  isConcurrencySafe: boolean;

  /** Is this a read-only tool? (available in Plan mode) */
  isReadOnly: boolean;

  /** Execute the tool with validated arguments */
  execute: (args: z.infer<TArgs>, context: ToolContext) => Promise<ToolResult>;
}

// ── Tool Categories ───────────────────────────────────────

export type ToolCategory =
  | "filesystem"    // read, write, edit, glob, grep
  | "execution"     // bash
  | "navigation"    // lsp (go-to-def, find-refs)
  | "agent"         // plan_enter, plan_exit, task (subagent)
  | "interaction"   // question (ask user)
  | "custom";       // user-defined tools

// ── Tool Context ──────────────────────────────────────────
// Passed to every tool execution, providing access to
// session state, configuration, and utilities.

export interface ToolContext {
  /** Current working directory */
  cwd: string;

  /** Session ID */
  sessionId: string;

  /** Active agent mode */
  agentMode: "build" | "plan";

  /** Permission checker — can this tool run? */
  checkPermission: (toolName: string) => Promise<PermissionAction>;

  /** Callback for asking user confirmation */
  askUser?: (question: string) => Promise<boolean>;

  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

// ── Permission Action ─────────────────────────────────────

export type PermissionAction =
  | { allowed: true }
  | { allowed: false; reason: string };

// ── Tool Call (from LLM) ──────────────────────────────────

export interface ToolCall {
  /** Unique call ID (from the LLM) */
  id: string;

  /** Tool name to invoke */
  name: string;

  /** Raw arguments from the LLM (pre-validation) */
  rawArgs: Record<string, unknown>;
}

// ── Tool Call Result (back to LLM) ────────────────────────

export interface ToolCallResult {
  /** The original call ID */
  callId: string;

  /** Tool name */
  name: string;

  /** The result */
  result: ToolResult;

  /** Whether validation failed */
  validationError?: string;

  /** Whether permission was denied */
  permissionDenied?: boolean;
}
