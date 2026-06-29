// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Session Layer Exports
// ═══════════════════════════════════════════════════════════

export { SessionManager } from "./session.js";
export type {
  SessionCreateOptions,
  LLMMessage,
  MessageRole,
  SessionInfo,
} from "./session.js";

// System Prompt Architecture (Phase 5)
export {
  buildSystemPrompt,
  buildMinimalPrompt,
  estimatePromptTokens,
} from "./system.js";
export type {
  SystemPromptOptions,
  ToolDescription,
} from "./system.js";

// Parallel Worktree Subagents
export { WorktreeManager } from "./worktree.js";
export type { WorktreeJob } from "./worktree.js";

