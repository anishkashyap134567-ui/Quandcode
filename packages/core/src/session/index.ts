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

