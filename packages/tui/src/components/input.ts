// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode TUI — Interactive Input Handler
// ═══════════════════════════════════════════════════════════
//
// Handles reading user input from the terminal,
// command parsing, and dispatching to the agent.

import * as readline from "node:readline";
import chalk from "chalk";
import { CYBER, BANNER, DIVIDER } from "../theme.js";

export interface InputCommand {
  type: "prompt" | "command" | "quit";
  value: string;
}

// ── Special Commands ──────────────────────────────────────

const COMMANDS: Record<string, { description: string; action: string }> = {
  "/quit":    { description: "Exit QuandCode", action: "quit" },
  "/exit":    { description: "Exit QuandCode", action: "quit" },
  "/clear":   { description: "Clear the terminal", action: "clear" },
  "/plan":    { description: "Switch to Plan mode", action: "plan" },
  "/build":   { description: "Switch to Build mode", action: "build" },
  "/models":  { description: "List available models", action: "models" },
  "/session": { description: "Show current session info", action: "session" },
  "/help":    { description: "Show help", action: "help" },
  "/compact": { description: "Toggle compact output", action: "compact" },
  "/config":  { description: "Open interactive configuration wizard", action: "config" },
};

// ── Input Handler ─────────────────────────────────────────

export class InputHandler {
  private rl: readline.Interface;
  private history: string[] = [];

  constructor() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
      historySize: 100,
    });
  }

  /**
   * Read a single line of input from the user.
   */
  async readLine(prompt: string): Promise<InputCommand> {
    return new Promise((resolve) => {
      this.rl.question(prompt, (answer) => {
        const trimmed = answer.trim();

        if (!trimmed) {
          resolve({ type: "prompt", value: "" });
          return;
        }

        this.history.push(trimmed);

        // Check for slash commands
        if (trimmed.startsWith("/")) {
          const cmd = trimmed.split(" ")[0].toLowerCase();
          if (cmd === "/quit" || cmd === "/exit") {
            resolve({ type: "quit", value: "" });
            return;
          }
          resolve({ type: "command", value: trimmed });
          return;
        }

        resolve({ type: "prompt", value: trimmed });
      });
    });
  }

  /**
   * Handle a slash command and return the action to take.
   */
  handleCommand(input: string): string {
    const parts = input.split(" ");
    const cmd = parts[0].toLowerCase();
    const cmdDef = COMMANDS[cmd];

    if (!cmdDef) {
      console.log(
        `${CYBER.error("Unknown command:")} ${CYBER.textBright(cmd)}\n` +
        `${CYBER.textDim("Type /help for available commands.")}`
      );
      return "unknown";
    }

    switch (cmdDef.action) {
      case "clear":
        console.clear();
        return "clear";

      case "help":
        this.showHelp();
        return "help";

      case "plan":
      case "build":
      case "models":
      case "session":
      case "compact":
      case "config":
        return cmdDef.action;

      default:
        return "unknown";
    }
  }

  /**
   * Show the help screen.
   */
  private showHelp(): void {
    console.log();
    console.log(`${CYBER.neonCyan.bold("  Available Commands")}`);
    console.log(CYBER.dimCyan("  " + "─".repeat(40)));

    for (const [cmd, def] of Object.entries(COMMANDS)) {
      console.log(
        `  ${CYBER.neonCyan(cmd.padEnd(12))} ${CYBER.textDim(def.description)}`
      );
    }

    console.log();
    console.log(`  ${CYBER.textDim("Or just type a prompt to start the AI agent.")}`);
    console.log();
  }

  /**
   * Ask the user a question asynchronously (for configuration wizard).
   */
  async askQuestion(query: string): Promise<string> {
    return new Promise((resolve) => {
      this.rl.question(query, (answer) => {
        resolve(answer.trim());
      });
    });
  }

  /**
   * Close the input handler.
   */
  close(): void {
    this.rl.close();
  }
}
