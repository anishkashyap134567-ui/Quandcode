// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode TUI — Streaming Renderer
// ═══════════════════════════════════════════════════════════
//
// A pure terminal renderer (no React/Ink dependency).
// Uses ANSI escape codes and chalk for the cyberpunk TUI.
// Connects directly to AgentLoop event callbacks.

import chalk from "chalk";
import {
  CYBER, BANNER, DIVIDER, DIVIDER_BOLD,
  MATRIX_SPINNER, GLITCH_SPINNER,
  formatToolName, formatAgentMode, formatTokens,
  formatDuration, cyberBox, truncate,
} from "../theme.js";
import type { AgentEvents, AgentResult } from "@quandcode/core";
import type { ToolCall, ToolCallResult } from "@quandcode/core";
import type { Session } from "@quandcode/core";

// ── Renderer State ────────────────────────────────────────

interface RendererState {
  mode: "build" | "plan";
  iteration: number;
  totalToolCalls: number;
  isThinking: boolean;
  streamBuffer: string;
  spinnerFrame: number;
  spinnerTimer: ReturnType<typeof setInterval> | null;
}

// ── Streaming Renderer ────────────────────────────────────

export class CyberRenderer {
  private state: RendererState = {
    mode: "build",
    iteration: 0,
    totalToolCalls: 0,
    isThinking: false,
    streamBuffer: "",
    spinnerFrame: 0,
    spinnerTimer: null,
  };

  constructor() {}

  // ╔═══════════════════════════════════════════════════════
  // ║ PUBLIC METHODS
  // ╚═══════════════════════════════════════════════════════

  /**
   * Print the startup banner.
   */
  showBanner(): void {
    console.log(BANNER);
    console.log();
  }

  /**
   * Show the input prompt for the user.
   */
  showPrompt(): void {
    process.stdout.write(`\n${formatAgentMode(this.state.mode)} ${CYBER.dimCyan("›")} `);
  }

  /**
   * Build AgentEvents callbacks that drive this renderer.
   */
  createEventHandlers(): AgentEvents {
    return {
      onStart: (session: Session) => {
        this.onStart(session);
      },
      onLLMRequest: (iteration: number, messageCount: number) => {
        this.onLLMRequest(iteration, messageCount);
      },
      onLLMText: (text: string, iteration: number) => {
        this.onLLMText(text, iteration);
      },
      onToolCalls: (calls: ToolCall[], iteration: number) => {
        this.onToolCalls(calls, iteration);
      },
      onToolResult: (result: ToolCallResult, iteration: number) => {
        this.onToolResult(result, iteration);
      },
      onStreamChunk: (text: string) => {
        this.onStreamChunk(text);
      },
      onComplete: (result: AgentResult) => {
        this.onComplete(result);
      },
      onError: (error: Error) => {
        this.onError(error);
      },
      onModeSwitch: (newMode: "build" | "plan") => {
        this.onModeSwitch(newMode);
      },
    };
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ EVENT HANDLERS
  // ╚═══════════════════════════════════════════════════════

  private onStart(session: Session): void {
    console.log(
      `\n${CYBER.dimCyan("┌")} ${CYBER.textDim("Session:")} ${CYBER.neonCyan(session.id.substring(0, 12))}` +
      `  ${formatAgentMode(this.state.mode)}`
    );
    console.log(CYBER.dimCyan("│"));
  }

  private onLLMRequest(iteration: number, messageCount: number): void {
    this.state.iteration = iteration;
    this.startSpinner(`Thinking (turn ${iteration})`);
  }

  private onLLMText(text: string, _iteration: number): void {
    this.stopSpinner();

    // Print the assistant's response with cyber styling
    console.log(CYBER.dimCyan("│"));
    console.log(`${CYBER.dimCyan("│")} ${CYBER.neonMagenta("⚡")} ${CYBER.textBright.bold("Assistant")}`);
    console.log(CYBER.dimCyan("│"));

    // Format the text with line wrapping
    const lines = text.split("\n");
    for (const line of lines) {
      if (line.startsWith("```")) {
        console.log(`${CYBER.dimCyan("│")}   ${CYBER.dimMagenta(line)}`);
      } else if (line.startsWith("#")) {
        console.log(`${CYBER.dimCyan("│")}   ${CYBER.neonCyan.bold(line)}`);
      } else if (line.startsWith("- ") || line.startsWith("* ")) {
        console.log(`${CYBER.dimCyan("│")}   ${CYBER.neonGreen("▸")} ${CYBER.text(line.substring(2))}`);
      } else {
        console.log(`${CYBER.dimCyan("│")}   ${CYBER.text(line)}`);
      }
    }
  }

  private onStreamChunk(text: string): void {
    // For real-time streaming, write directly without newline
    this.stopSpinner();
    process.stdout.write(CYBER.text(text));
    this.state.streamBuffer += text;
  }

  private onToolCalls(calls: ToolCall[], _iteration: number): void {
    this.stopSpinner();
    console.log(CYBER.dimCyan("│"));

    const toolCountLabel = calls.length === 1
      ? "1 tool call"
      : `${calls.length} tool calls`;

    console.log(
      `${CYBER.dimCyan("│")} ${CYBER.neonYellow("⚙")} ` +
      `${CYBER.neonYellow.bold("Tool Execution")} ${CYBER.textDim(`(${toolCountLabel})`)}`
    );

    for (const call of calls) {
      const argsPreview = truncate(JSON.stringify(call.rawArgs), 60);
      console.log(
        `${CYBER.dimCyan("│")}   ${formatToolName(call.name)} ` +
        `${CYBER.textDim(argsPreview)}`
      );
    }
  }

  private onToolResult(result: ToolCallResult, _iteration: number): void {
    this.state.totalToolCalls++;

    const statusIcon = result.result.success
      ? CYBER.success("✔")
      : CYBER.error("✖");

    const outputPreview = result.result.success
      ? truncate(result.result.output.split("\n")[0] || "(no output)", 50)
      : truncate(result.result.error || "Unknown error", 50);

    console.log(
      `${CYBER.dimCyan("│")}   ${statusIcon} ${CYBER.textDim(result.name)} → ` +
      `${result.result.success ? CYBER.text(outputPreview) : CYBER.error(outputPreview)}`
    );
  }

  private onComplete(result: AgentResult): void {
    this.stopSpinner();
    console.log(CYBER.dimCyan("│"));
    console.log(CYBER.dimCyan("└") + CYBER.dimCyan("─".repeat(59)));

    // Summary box
    const summaryLines = [
      `${CYBER.textDim("Finish:")}    ${this.formatFinishReason(result.finishReason)}`,
      `${CYBER.textDim("Turns:")}     ${CYBER.neonCyan(result.iterations.toString())}`,
      `${CYBER.textDim("Tools:")}     ${CYBER.neonYellow(result.toolCallCount.toString())} calls`,
      `${CYBER.textDim("Tokens:")}    ${formatTokens(result.totalTokens.input, result.totalTokens.output)}`,
      `${CYBER.textDim("Duration:")}  ${CYBER.neonGreen(formatDuration(result.durationMs))}`,
    ];

    console.log();
    console.log(cyberBox("Session Summary", summaryLines.join("\n"), CYBER.dimCyan));
    console.log();
  }

  private onError(error: Error): void {
    this.stopSpinner();
    console.log(CYBER.dimCyan("│"));
    console.log(
      `${CYBER.dimCyan("│")} ${CYBER.error("✖ ERROR:")} ${CYBER.error(error.message)}`
    );
  }

  private onModeSwitch(newMode: "build" | "plan"): void {
    this.state.mode = newMode;
    console.log(CYBER.dimCyan("│"));
    console.log(
      `${CYBER.dimCyan("│")} ${CYBER.neonMagenta("⚡")} ${CYBER.textBright("Mode switched to")} ` +
      `${formatAgentMode(newMode)}`
    );
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ SPINNER
  // ╚═══════════════════════════════════════════════════════

  private startSpinner(label: string): void {
    this.state.isThinking = true;
    this.state.spinnerFrame = 0;

    const render = () => {
      const frame = MATRIX_SPINNER[this.state.spinnerFrame % MATRIX_SPINNER.length];
      const glitch = GLITCH_SPINNER[this.state.spinnerFrame % GLITCH_SPINNER.length];

      // Clear line and rewrite
      process.stdout.write(`\r${CYBER.dimCyan("│")} ${CYBER.neonMagenta(frame)} ${CYBER.textDim(label)} ${CYBER.dimMagenta(glitch)}`);
      this.state.spinnerFrame++;
    };

    render();
    this.state.spinnerTimer = setInterval(render, 100);
  }

  private stopSpinner(): void {
    if (this.state.spinnerTimer) {
      clearInterval(this.state.spinnerTimer);
      this.state.spinnerTimer = null;
      // Clear the spinner line
      process.stdout.write("\r" + " ".repeat(70) + "\r");
    }
    this.state.isThinking = false;
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ UTILITIES
  // ╚═══════════════════════════════════════════════════════

  private formatFinishReason(reason: string): string {
    switch (reason) {
      case "complete":       return CYBER.success("✔ Complete");
      case "max_iterations": return CYBER.warning("⚠ Max iterations reached");
      case "cancelled":      return CYBER.warning("⚠ Cancelled");
      case "error":          return CYBER.error("✖ Error");
      default:               return CYBER.textDim(reason);
    }
  }
}
