// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — plan_enter Tool
// ═══════════════════════════════════════════════════════════
//
// Switches the agent from Build mode to Plan mode.
// In Plan mode, the agent becomes a read-only architect.
// All write tools (file_write, file_edit, bash) are disabled.

import { z } from "zod";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const PlanEnterParams = z.object({
  reason: z.string().describe("Why you are switching to Plan mode (e.g., 'Need to analyze the codebase before refactoring')"),
});

type PlanEnterArgs = z.infer<typeof PlanEnterParams>;

// ── Implementation ────────────────────────────────────────

async function execute(args: PlanEnterArgs, context: ToolContext): Promise<ToolResult> {
  if (context.agentMode === "plan") {
    return {
      success: true,
      output: "Already in Plan mode. You are currently a read-only architect.",
    };
  }

  // The actual mode switch is handled by the AgentLoop intercepting this tool call,
  // or by a state manager if integrated differently. For the tool itself, we just
  // signal the switch. The session manager will record the active agent change.

  return {
    success: true,
    output: `Switched to PLAN mode.\nReason: ${args.reason}\n\n` +
            `You are now a read-only architect. You can use read tools (file_read, glob, grep, list_dir) ` +
            `to explore the codebase and formulate a plan. ` +
            `When your plan is ready, use the 'plan_exit' tool to switch back to BUILD mode and execute it.`,
    data: {
      action: "switch_mode",
      newMode: "plan",
    },
  };
}

// ── Tool Definition ───────────────────────────────────────

export const planEnterTool: ToolDefinition<typeof PlanEnterParams> = {
  name: "plan_enter",
  description: "Switch to Plan mode (read-only architect) to analyze code before making complex changes.",
  longDescription:
    "Switches your operating mode from Build to Plan. In Plan mode, you cannot modify files or run " +
    "destructive commands. Use this when you need to safely explore a large codebase, trace " +
    "dependencies, or formulate a multi-step refactoring plan before executing it.",
  parameters: PlanEnterParams,
  category: "agent",
  isConcurrencySafe: false,
  isReadOnly: true, // Can be called in any mode
  execute,
};
