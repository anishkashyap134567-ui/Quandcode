// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode TUI — Status Bar
// ═══════════════════════════════════════════════════════════
//
// A persistent bottom status bar showing key information:
// mode, model, session, token count, cost.

import chalk from "chalk";
import { CYBER, formatAgentMode, formatTokens, formatDuration } from "../theme.js";

export interface StatusBarState {
  mode: "build" | "plan";
  model: string;
  provider: string;
  sessionId: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  durationMs: number;
}

export class StatusBar {
  private state: StatusBarState = {
    mode: "build",
    model: "—",
    provider: "—",
    sessionId: "—",
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    durationMs: 0,
  };

  update(partial: Partial<StatusBarState>): void {
    Object.assign(this.state, partial);
  }

  render(): string {
    const cols = process.stdout.columns || 80;

    // Left side: mode + model
    const left = [
      formatAgentMode(this.state.mode),
      CYBER.dimCyan("│"),
      CYBER.textDim(this.state.provider + "/") + CYBER.neonCyan(this.state.model),
    ].join(" ");

    // Right side: tokens + tools + duration
    const right = [
      formatTokens(this.state.inputTokens, this.state.outputTokens),
      CYBER.dimCyan("│"),
      CYBER.neonYellow(`${this.state.toolCalls}`) + CYBER.textDim(" tools"),
      CYBER.dimCyan("│"),
      CYBER.neonGreen(formatDuration(this.state.durationMs)),
    ].join(" ");

    return `${CYBER.bgAlt(left)}  ${CYBER.bgAlt(right)}`;
  }

  print(): void {
    console.log(this.render());
  }
}
