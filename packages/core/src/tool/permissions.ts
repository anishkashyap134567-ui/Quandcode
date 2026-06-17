// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Permission Manager
// ═══════════════════════════════════════════════════════════
//
// Controls which tools the agent can use and how:
// - "allow"  → execute immediately, no confirmation
// - "ask"    → prompt user for y/N before executing
// - "deny"   → blocked entirely, LLM cannot call it
//
// Permissions are configured per-tool in quandcode.json
// and can be overridden with --yes flag (auto-approve all).

import type {
  PermissionLevel,
  PermissionAction,
  ToolDefinition,
} from "./types.js";

// ── Default Permissions ───────────────────────────────────

const DEFAULT_PERMISSIONS: Record<string, PermissionLevel> = {
  // Filesystem (read-only) — always allowed
  file_read: "allow",
  glob: "allow",
  grep: "allow",
  list_dir: "allow",

  // Filesystem (write) — ask by default
  file_write: "ask",
  file_edit: "ask",

  // Execution — ask by default
  bash: "ask",

  // Agent tools — always allowed
  plan_enter: "allow",
  plan_exit: "allow",
  task: "allow",
  question: "allow",

  // LSP — always allowed (read-only diagnostics)
  lsp_diagnostics: "allow",
  lsp_definition: "allow",
  lsp_references: "allow",
};

// ── Permission Manager ────────────────────────────────────

export class PermissionManager {
  private overrides: Map<string, PermissionLevel> = new Map();
  private autoApprove: boolean = false;
  private askCallback: ((question: string) => Promise<boolean>) | null = null;

  /**
   * Create a PermissionManager with optional config overrides.
   */
  constructor(opts?: {
    permissions?: Record<string, PermissionLevel>;
    autoApprove?: boolean;
    askCallback?: (question: string) => Promise<boolean>;
  }) {
    if (opts?.permissions) {
      for (const [tool, level] of Object.entries(opts.permissions)) {
        this.overrides.set(tool, level);
      }
    }
    this.autoApprove = opts?.autoApprove || false;
    this.askCallback = opts?.askCallback || null;
  }

  /**
   * Set auto-approve mode (--yes flag).
   */
  setAutoApprove(enabled: boolean): void {
    this.autoApprove = enabled;
  }

  /**
   * Set the callback for asking user permission.
   */
  setAskCallback(callback: (question: string) => Promise<boolean>): void {
    this.askCallback = callback;
  }

  /**
   * Override permission for a specific tool.
   */
  setPermission(toolName: string, level: PermissionLevel): void {
    this.overrides.set(toolName, level);
  }

  /**
   * Get the permission level for a tool.
   */
  getPermissionLevel(toolName: string): PermissionLevel {
    // Check overrides first
    if (this.overrides.has(toolName)) {
      return this.overrides.get(toolName)!;
    }

    // Fall back to defaults
    return DEFAULT_PERMISSIONS[toolName] || "ask";
  }

  /**
   * Check if a tool is allowed to execute.
   * Returns an action: allowed (true) or denied with reason.
   */
  async checkPermission(
    toolName: string,
    description?: string
  ): Promise<PermissionAction> {
    const level = this.getPermissionLevel(toolName);

    switch (level) {
      case "allow":
        return { allowed: true };

      case "deny":
        return {
          allowed: false,
          reason: `Tool "${toolName}" is denied by configuration. Update quandcode.json to change permissions.`,
        };

      case "ask": {
        // Auto-approve mode (--yes flag)
        if (this.autoApprove) {
          return { allowed: true };
        }

        // Ask user for permission
        if (this.askCallback) {
          const question = description
            ? `Allow tool "${toolName}"? (${description})`
            : `Allow tool "${toolName}"?`;

          const approved = await this.askCallback(question);
          if (approved) {
            return { allowed: true };
          }
          return {
            allowed: false,
            reason: `User denied permission for tool "${toolName}".`,
          };
        }

        // No callback available — default to deny for safety
        return {
          allowed: false,
          reason: `Tool "${toolName}" requires permission but no confirmation handler is available. Use --yes flag to auto-approve.`,
        };
      }

      default:
        return {
          allowed: false,
          reason: `Unknown permission level "${level}" for tool "${toolName}".`,
        };
    }
  }

  /**
   * Check if a tool is available in the current agent mode.
   * Plan mode restricts tools to read-only.
   */
  checkAgentMode(
    tool: ToolDefinition,
    agentMode: "build" | "plan"
  ): PermissionAction {
    if (agentMode === "build") {
      // Build mode has access to all tools
      return { allowed: true };
    }

    // Plan mode: only read-only tools allowed
    if (tool.isReadOnly) {
      return { allowed: true };
    }

    return {
      allowed: false,
      reason: `Tool "${tool.name}" is not available in Plan mode (read-only). Switch to Build mode with Tab or plan_exit.`,
    };
  }

  /**
   * Get a summary of all permission settings.
   */
  getSummary(): Array<{ tool: string; level: PermissionLevel }> {
    const allTools = new Set([
      ...Object.keys(DEFAULT_PERMISSIONS),
      ...this.overrides.keys(),
    ]);

    return Array.from(allTools)
      .sort()
      .map((tool) => ({
        tool,
        level: this.getPermissionLevel(tool),
      }));
  }
}
