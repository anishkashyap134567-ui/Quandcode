#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Session Manager Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import { createTestDatabase } from "../storage/database.js";
import { SessionManager } from "./session.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode Session Tests")} ${chalk.bold.yellowBright("⚡")}       ${chalk.cyan("║")}
${chalk.cyan("╚═══════════════════════════════════════════╝")}
`;

console.log(banner);

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void>) {
  return fn()
    .then(() => {
      console.log(chalk.green(`  ✔ ${name}`));
      passed++;
    })
    .catch((err: Error) => {
      console.log(chalk.red(`  ✖ ${name}`));
      console.log(chalk.red(`    Error: ${err.message}`));
      failed++;
    });
}

async function runTests() {
  const db = createTestDatabase();
  const manager = SessionManager.fromDatabase(db);

  let sessionId = "";

  // ── Session Lifecycle ──────────────────────────────────
  console.log(chalk.cyan("\n  Session Lifecycle"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Start a new session", async () => {
    const session = await manager.startSession({
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      cwd: "/tmp/test",
    });
    sessionId = session.id;
    if (session.status !== "active") throw new Error("Should be active");
    if (session.activeAgent !== "build") throw new Error("Default agent should be build");
  });

  await test("Start session with Plan agent", async () => {
    const session = await manager.startSession({
      model: "gpt-4o",
      provider: "openai",
      agent: "plan",
    });
    if (session.activeAgent !== "plan") throw new Error("Should be plan agent");
    await manager.deleteSession(session.id);
  });

  await test("Resume session", async () => {
    // End session first
    await manager.endSession(sessionId);
    const info = await manager.getSessionInfo(sessionId);
    if (info?.session.status !== "completed") throw new Error("Should be completed");

    // Resume it
    const resumed = await manager.resumeSession(sessionId);
    if (!resumed) throw new Error("Failed to resume");
    if (resumed.status !== "active") throw new Error("Should be active after resume");
  });

  await test("Get last session", async () => {
    const last = await manager.getLastSession();
    if (!last) throw new Error("No last session");
    if (last.id !== sessionId) throw new Error("Wrong session returned");
  });

  // ── Message Flow ───────────────────────────────────────
  console.log(chalk.cyan("\n  Message Flow"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Add user message (auto-generates title)", async () => {
    const msg = await manager.addUserMessage(sessionId, "Add JWT authentication to the Express API");
    if (msg.role !== "user") throw new Error("Role mismatch");

    // Check title was auto-generated
    const info = await manager.getSessionInfo(sessionId);
    if (!info?.session.title?.includes("JWT")) throw new Error("Title not generated from message");
  });

  await test("Add assistant message with tokens", async () => {
    const msg = await manager.addAssistantMessage(sessionId, "I'll implement JWT auth. Let me first read the existing routes.", {
      model: "claude-sonnet-4-20250514",
      inputTokens: 250,
      outputTokens: 80,
      durationMs: 1500,
    });
    if (msg.model !== "claude-sonnet-4-20250514") throw new Error("Model not recorded");
  });

  await test("Add tool call", async () => {
    const msg = await manager.addToolCall(sessionId, "file_read", "call_001", { path: "src/routes/index.ts" });
    if (msg.toolName !== "file_read") throw new Error("Tool name mismatch");
  });

  await test("Add tool result", async () => {
    const msg = await manager.addToolResult(sessionId, "call_001", "import express from 'express';\n...");
    if (msg.role !== "tool") throw new Error("Role should be tool");
  });

  await test("Add system message", async () => {
    const msg = await manager.addSystemMessage(sessionId, "Context window at 75% capacity");
    if (msg.role !== "system") throw new Error("Role should be system");
  });

  // ── LLM Message Composition ────────────────────────────
  console.log(chalk.cyan("\n  LLM Message Composition"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Build LLM messages", async () => {
    const llmMessages = await manager.buildLLMMessages(sessionId);
    if (llmMessages.length !== 5) throw new Error(`Expected 5 messages, got ${llmMessages.length}`);
    if (llmMessages[0].role !== "user") throw new Error("First should be user");
    if (llmMessages[1].role !== "assistant") throw new Error("Second should be assistant");
    if (llmMessages[2].toolCalls?.[0]?.name !== "file_read") throw new Error("Tool call not composed");
    if (llmMessages[3].toolCallId !== "call_001") throw new Error("Tool result not linked");
  });

  // ── Session Info & Stats ───────────────────────────────
  console.log(chalk.cyan("\n  Session Info & Stats"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Get full session info", async () => {
    const info = await manager.getSessionInfo(sessionId);
    if (!info) throw new Error("No info returned");
    if (info.messageCount !== 5) throw new Error(`Expected 5 messages, got ${info.messageCount}`);
    if (info.totalTokens.input !== 250) throw new Error(`Input tokens: expected 250, got ${info.totalTokens.input}`);
    if (info.totalTokens.output !== 80) throw new Error(`Output tokens: expected 80, got ${info.totalTokens.output}`);
    if (info.totalTokens.total !== 330) throw new Error(`Total tokens: expected 330, got ${info.totalTokens.total}`);
  });

  // ── Agent Switching ────────────────────────────────────
  console.log(chalk.cyan("\n  Agent Switching (Tab)"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Switch to Plan agent", async () => {
    await manager.switchAgent(sessionId, "plan");
    const info = await manager.getSessionInfo(sessionId);
    if (info?.session.activeAgent !== "plan") throw new Error("Should be plan");
  });

  await test("Switch back to Build agent", async () => {
    await manager.switchAgent(sessionId, "build");
    const info = await manager.getSessionInfo(sessionId);
    if (info?.session.activeAgent !== "build") throw new Error("Should be build");
  });

  // ── Session Forking ────────────────────────────────────
  console.log(chalk.cyan("\n  Session Forking"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Fork session copies messages", async () => {
    const forked = await manager.forkSession(sessionId, "Experimental Auth");
    if (!forked) throw new Error("Fork failed");
    if (forked.title !== "Experimental Auth") throw new Error("Title mismatch");

    const forkedMsgs = await manager.buildLLMMessages(forked.id);
    if (forkedMsgs.length !== 5) throw new Error(`Expected 5 messages in fork, got ${forkedMsgs.length}`);

    // Clean up
    await manager.deleteSession(forked.id);
  });

  // ── List Sessions ──────────────────────────────────────
  console.log(chalk.cyan("\n  Session Listing"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("List sessions", async () => {
    const all = await manager.listSessions();
    if (all.length < 1) throw new Error("Expected at least 1 session");
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
  process.exit(0);
}

runTests().catch((err) => {
  console.error(chalk.red(`\n✖ Test runner error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
