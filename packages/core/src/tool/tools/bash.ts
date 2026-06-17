// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — bash Tool
// ═══════════════════════════════════════════════════════════
//
// Executes shell commands with timeout, output capture,
// and working directory control.

import { z } from "zod";
import * as path from "node:path";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const BashParams = z.object({
  command: z.string().describe("The shell command to execute"),
  cwd: z.string().optional().describe("Working directory (defaults to session CWD)"),
  timeout: z.number().default(30000).describe("Timeout in milliseconds (default: 30s)"),
});

type BashArgs = z.infer<typeof BashParams>;

// ── Constants ─────────────────────────────────────────────

const MAX_OUTPUT = 50_000; // Max chars of stdout/stderr to return

// ── Implementation ────────────────────────────────────────

async function execute(args: BashArgs, context: ToolContext): Promise<ToolResult> {
  const cwd = args.cwd
    ? path.isAbsolute(args.cwd) ? args.cwd : path.resolve(context.cwd, args.cwd)
    : context.cwd;

  try {
    // Use Bun's native spawn
    const proc = Bun.spawn(["sh", "-c", args.command], {
      cwd,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        ...process.env,
        // Prevent interactive pagers
        PAGER: "cat",
        GIT_PAGER: "cat",
        // Force color off for clean output
        NO_COLOR: "1",
        FORCE_COLOR: "0",
      },
    });

    // Wait for completion with timeout
    const timeoutPromise = new Promise<null>((_, reject) => {
      setTimeout(() => {
        proc.kill();
        reject(new Error("TIMEOUT"));
      }, args.timeout);
    });

    let exitCode: number;
    try {
      exitCode = await Promise.race([proc.exited, timeoutPromise]) as number;
    } catch (err: any) {
      if (err.message === "TIMEOUT") {
        return {
          success: false,
          output: "",
          error: `Command timed out after ${args.timeout / 1000}s: ${args.command}`,
        };
      }
      throw err;
    }

    // Read output
    const stdoutRaw = await new Response(proc.stdout).text();
    const stderrRaw = await new Response(proc.stderr).text();

    // Truncate if needed
    const stdout = stdoutRaw.length > MAX_OUTPUT
      ? stdoutRaw.substring(0, MAX_OUTPUT) + `\n... (truncated, ${stdoutRaw.length} total chars)`
      : stdoutRaw;

    const stderr = stderrRaw.length > MAX_OUTPUT
      ? stderrRaw.substring(0, MAX_OUTPUT) + `\n... (truncated, ${stderrRaw.length} total chars)`
      : stderrRaw;

    // Build output
    let output = "";
    if (stdout.trim()) {
      output += stdout.trim();
    }
    if (stderr.trim()) {
      if (output) output += "\n\n";
      output += `STDERR:\n${stderr.trim()}`;
    }
    if (!output) {
      output = "(no output)";
    }

    // Add exit code info
    const header = `$ ${args.command}\n(exit code: ${exitCode}, cwd: ${cwd})\n${"─".repeat(50)}\n`;

    return {
      success: exitCode === 0,
      output: header + output,
      error: exitCode !== 0 ? `Command failed with exit code ${exitCode}` : undefined,
      data: {
        command: args.command,
        cwd,
        exitCode,
        stdoutLength: stdoutRaw.length,
        stderrLength: stderrRaw.length,
      },
    };
  } catch (err) {
    return {
      success: false,
      output: "",
      error: `Failed to execute command: ${(err as Error).message}`,
    };
  }
}

// ── Tool Definition ───────────────────────────────────────

export const bashTool: ToolDefinition<typeof BashParams> = {
  name: "bash",
  description: "Execute a shell command and return its output.",
  longDescription:
    "Runs a command in a shell subprocess. Captures stdout and stderr. " +
    `Default timeout: 30 seconds. Max output: ${MAX_OUTPUT} chars (truncated if longer). ` +
    "Use for: running builds, tests, git operations, package managers, etc. " +
    "Avoid long-running or interactive commands.",
  parameters: BashParams,
  category: "execution",
  isConcurrencySafe: false,
  isReadOnly: false,
  execute,
};
