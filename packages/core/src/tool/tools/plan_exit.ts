// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — plan_exit Tool
// ═══════════════════════════════════════════════════════════
//
// Switches the agent from Plan mode to Build mode.
// Used when the agent has finished exploring and formulating
// a plan, and is ready to execute it.

import { z } from "zod";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const PlanExitParams = z.object({
  plan: z.string().describe("The detailed implementation plan you have formulated and are about to execute"),
});

type PlanExitArgs = z.infer<typeof PlanExitParams>;

// ── Implementation ────────────────────────────────────────

async function execute(args: PlanExitArgs, context: ToolContext): Promise<ToolResult> {
  if (context.agentMode === "build") {
    return {
      success: true,
      output: "Already in Build mode. You have full access to all tools.",
    };
  }

  // Like plan_enter, the actual mode switch must be handled by the AgentLoop
  // looking for this specific tool call result.

  return {
    success: true,
    output: `Switched to BUILD mode.\n\nPlan recorded:\n${args.plan}\n\n` +
            `You are now a full-access engineer. All write tools (file_write, file_edit, bash) ` +
            `are available. Proceed with executing your plan step-by-step.`,
    data: {
      action: "switch_mode",
      newMode: "build",
      plan: args.plan,
    },
  };
}

// ── Tool Definition ───────────────────────────────────────

export const planExitTool: ToolDefinition<typeof PlanExitParams> = {
  name: "plan_exit",
  description: "Switch to Build mode (full-access engineer) to execute your plan.",
  longDescription:
    "Switches your operating mode from Plan to Build. Use this when you have finished exploring " +
    "the codebase and have a solid plan ready to execute. You must provide the plan as an argument. " +
    "Once in Build mode, you regain access to all write/destructive tools.",
  parameters: PlanExitParams,
  category: "agent",
  isConcurrencySafe: false,
  isReadOnly: true, // Needs to be callable from Plan mode
  execute,
};
