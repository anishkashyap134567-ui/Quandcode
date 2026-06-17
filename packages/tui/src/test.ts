#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode TUI — Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import {
  CYBER, BANNER, DIVIDER, DIVIDER_BOLD,
  formatToolName, formatAgentMode, formatTokens,
  formatDuration, formatCost, cyberBox, truncate,
  MATRIX_SPINNER, GLITCH_SPINNER,
} from "./theme.js";
import { CyberRenderer } from "./components/renderer.js";
import { StatusBar } from "./components/status_bar.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode TUI Tests")} ${chalk.bold.yellowBright("⚡")}           ${chalk.cyan("║")}
${chalk.cyan("╚═══════════════════════════════════════════╝")}
`;

console.log(banner);

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => { console.log(chalk.green(`  ✔ ${name}`)); passed++; })
        .catch((err: Error) => { console.log(chalk.red(`  ✖ ${name}`)); console.log(chalk.red(`    ${err.message}`)); failed++; });
    }
    console.log(chalk.green(`  ✔ ${name}`)); passed++;
    return Promise.resolve();
  } catch (err: any) {
    console.log(chalk.red(`  ✖ ${name}`)); console.log(chalk.red(`    ${err.message}`)); failed++;
    return Promise.resolve();
  }
}

async function runTests() {
  // ── Theme ──────────────────────────────────────────────
  console.log(chalk.cyan("\n  Theme & Colors"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("CYBER color palette has all colors", () => {
    const required = ["neonCyan", "neonMagenta", "neonGreen", "neonYellow",
      "neonOrange", "neonRed", "neonPink", "neonBlue",
      "text", "textDim", "textBright", "success", "warning", "error", "info"];
    for (const key of required) {
      if (!(key in CYBER)) throw new Error(`Missing color: ${key}`);
    }
  });

  await test("Banner contains QuandCode ASCII art", () => {
    if (!BANNER.includes("█▀█")) throw new Error("Banner missing ASCII art");
    if (!BANNER.includes("v0.1.0")) throw new Error("Banner missing version");
  });

  await test("Dividers are correct length", () => {
    // Strip ANSI codes to check actual char length
    const stripped = DIVIDER.replace(/\x1b\[[0-9;]*m/g, "");
    if (stripped.length !== 60) throw new Error(`Divider length: ${stripped.length}`);
  });

  await test("Spinner arrays are populated", () => {
    if (MATRIX_SPINNER.length === 0) throw new Error("MATRIX_SPINNER empty");
    if (GLITCH_SPINNER.length === 0) throw new Error("GLITCH_SPINNER empty");
  });

  // ── Formatters ─────────────────────────────────────────
  console.log(chalk.cyan("\n  Formatters"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("formatToolName includes icon and name", () => {
    const result = formatToolName("file_read");
    if (!result.includes("file_read")) throw new Error("Missing tool name");
    if (!result.includes("📖")) throw new Error("Missing icon");
  });

  await test("formatToolName handles all 10 tools", () => {
    const tools = ["file_read", "file_write", "file_edit", "bash", "grep", "glob", "list_dir", "plan_enter", "plan_exit", "lsp_query"];
    for (const tool of tools) {
      const result = formatToolName(tool);
      if (!result.includes(tool)) throw new Error(`Missing name for ${tool}`);
    }
  });

  await test("formatAgentMode shows BUILD correctly", () => {
    const result = formatAgentMode("build");
    if (!result.includes("BUILD")) throw new Error("Missing BUILD label");
  });

  await test("formatAgentMode shows PLAN correctly", () => {
    const result = formatAgentMode("plan");
    if (!result.includes("PLAN")) throw new Error("Missing PLAN label");
  });

  await test("formatTokens shows input and output", () => {
    const result = formatTokens(1500, 300);
    if (!result.includes("1,500")) throw new Error("Missing input tokens");
    if (!result.includes("300")) throw new Error("Missing output tokens");
  });

  await test("formatDuration handles ms", () => {
    if (formatDuration(500) !== "500ms") throw new Error("500ms failed");
  });

  await test("formatDuration handles seconds", () => {
    const result = formatDuration(5000);
    if (!result.includes("5.0s")) throw new Error(`Expected 5.0s, got ${result}`);
  });

  await test("formatDuration handles minutes", () => {
    const result = formatDuration(120000);
    if (!result.includes("2.0m")) throw new Error(`Expected 2.0m, got ${result}`);
  });

  await test("formatCost formats correctly", () => {
    const result = formatCost(1500);
    if (!result.includes("$0.0015")) throw new Error(`Expected $0.0015, got ${result}`);
  });

  await test("truncate shortens long strings", () => {
    const long = "a".repeat(100);
    const result = truncate(long, 20);
    const stripped = result.replace(/\x1b\[[0-9;]*m/g, "");
    if (stripped.length > 20) throw new Error(`Not truncated: ${stripped.length} chars`);
  });

  await test("truncate preserves short strings", () => {
    const short = "hello";
    const result = truncate(short, 20);
    if (result !== short) throw new Error("Should not modify short string");
  });

  // ── CyberBox ───────────────────────────────────────────
  console.log(chalk.cyan("\n  CyberBox"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("cyberBox has title and content", () => {
    const result = cyberBox("Test Title", "Hello World");
    const stripped = result.replace(/\x1b\[[0-9;]*m/g, "");
    if (!stripped.includes("Test Title")) throw new Error("Missing title");
    if (!stripped.includes("Hello World")) throw new Error("Missing content");
    if (!stripped.includes("╭")) throw new Error("Missing top border");
    if (!stripped.includes("╰")) throw new Error("Missing bottom border");
  });

  await test("cyberBox handles multiline content", () => {
    const result = cyberBox("Multi", "Line 1\nLine 2\nLine 3");
    const stripped = result.replace(/\x1b\[[0-9;]*m/g, "");
    if (!stripped.includes("Line 1")) throw new Error("Missing line 1");
    if (!stripped.includes("Line 3")) throw new Error("Missing line 3");
  });

  // ── Renderer ───────────────────────────────────────────
  console.log(chalk.cyan("\n  Renderer"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("CyberRenderer creates event handlers", () => {
    const renderer = new CyberRenderer();
    const events = renderer.createEventHandlers();
    if (!events.onStart) throw new Error("Missing onStart");
    if (!events.onLLMRequest) throw new Error("Missing onLLMRequest");
    if (!events.onLLMText) throw new Error("Missing onLLMText");
    if (!events.onToolCalls) throw new Error("Missing onToolCalls");
    if (!events.onToolResult) throw new Error("Missing onToolResult");
    if (!events.onStreamChunk) throw new Error("Missing onStreamChunk");
    if (!events.onComplete) throw new Error("Missing onComplete");
    if (!events.onError) throw new Error("Missing onError");
    if (!events.onModeSwitch) throw new Error("Missing onModeSwitch");
  });

  // ── StatusBar ──────────────────────────────────────────
  console.log(chalk.cyan("\n  StatusBar"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("StatusBar renders with defaults", () => {
    const bar = new StatusBar();
    const result = bar.render();
    if (!result) throw new Error("Empty render");
  });

  await test("StatusBar updates state", () => {
    const bar = new StatusBar();
    bar.update({ mode: "plan", model: "claude-sonnet", provider: "anthropic" });
    const result = bar.render();
    if (!result.includes("PLAN")) throw new Error("Mode not updated");
    if (!result.includes("claude-sonnet")) throw new Error("Model not updated");
  });

  await test("StatusBar shows token counts", () => {
    const bar = new StatusBar();
    bar.update({ inputTokens: 2000, outputTokens: 500 });
    const result = bar.render();
    if (!result.includes("2,000")) throw new Error("Input tokens not shown");
    if (!result.includes("500")) throw new Error("Output tokens not shown");
  });

  // ── Results ────────────────────────────────────────────
  console.log(chalk.cyan("\n  " + "═".repeat(38)));
  console.log(
    `  ${chalk.bold.green(`${passed} passed`)}  ${
      failed > 0 ? chalk.bold.red(`${failed} failed`) : chalk.gray("0 failed")
    }`
  );
  console.log(chalk.cyan("  " + "═".repeat(38)));
  console.log();

  if (failed > 0) process.exit(1);
}

runTests().catch((err) => {
  console.error(chalk.red(`\n✖ Test runner error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
