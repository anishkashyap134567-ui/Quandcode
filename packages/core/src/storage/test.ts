#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Storage Layer Test
// ═══════════════════════════════════════════════════════════
//
// Tests all storage operations using an in-memory database.
// Run: bun run packages/core/src/storage/test.ts

import chalk from "chalk";
import { createTestDatabase } from "./database.js";
import { StorageService } from "./storage.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode Storage Tests")} ${chalk.bold.yellowBright("⚡")}       ${chalk.cyan("║")}
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
  const storage = new StorageService(db);

  // ── Session Tests ──────────────────────────────────────
  console.log(chalk.cyan("\n  Sessions"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  let sessionId: string = "";

  await test("Create a new session", async () => {
    const session = await storage.createSession({
      model: "claude-sonnet-4-20250514",
      provider: "anthropic",
      title: "Test Session",
      cwd: "/tmp/test",
    });
    sessionId = session.id;

    if (!session.id.startsWith("ses_")) throw new Error("ID should start with ses_");
    if (session.title !== "Test Session") throw new Error("Title mismatch");
    if (session.model !== "claude-sonnet-4-20250514") throw new Error("Model mismatch");
    if (session.provider !== "anthropic") throw new Error("Provider mismatch");
    if (session.status !== "active") throw new Error("Status should be active");
    if (session.activeAgent !== "build") throw new Error("Default agent should be build");
  });

  await test("Get session by ID", async () => {
    const session = await storage.getSession(sessionId);
    if (!session) throw new Error("Session not found");
    if (session.id !== sessionId) throw new Error("ID mismatch");
  });

  await test("List sessions (excludes subagents)", async () => {
    // Create a child session
    await storage.createSession({
      model: "gpt-4o",
      provider: "openai",
      parentId: sessionId,
      title: "Subagent Session",
    });

    const topLevel = await storage.listSessions();
    if (topLevel.length !== 1) throw new Error(`Expected 1 top-level session, got ${topLevel.length}`);
    if (topLevel[0].id !== sessionId) throw new Error("Wrong session returned");
  });

  await test("List child sessions", async () => {
    const children = await storage.listChildSessions(sessionId);
    if (children.length !== 1) throw new Error(`Expected 1 child, got ${children.length}`);
    if (children[0].title !== "Subagent Session") throw new Error("Child title mismatch");
  });

  await test("Update session title", async () => {
    await storage.setSessionTitle(sessionId, "Updated Title");
    const session = await storage.getSession(sessionId);
    if (session?.title !== "Updated Title") throw new Error("Title not updated");
  });

  await test("Update session status", async () => {
    await storage.updateSession(sessionId, { status: "completed", activeAgent: "plan" });
    const session = await storage.getSession(sessionId);
    if (session?.status !== "completed") throw new Error("Status not updated");
    if (session?.activeAgent !== "plan") throw new Error("Agent not updated");
  });

  await test("Token usage tracking", async () => {
    await storage.addTokenUsage(sessionId, 100, 50, 150);
    await storage.addTokenUsage(sessionId, 200, 100, 300);
    const session = await storage.getSession(sessionId);
    if (session?.totalInputTokens !== 300) throw new Error(`Input tokens: expected 300, got ${session?.totalInputTokens}`);
    if (session?.totalOutputTokens !== 150) throw new Error(`Output tokens: expected 150, got ${session?.totalOutputTokens}`);
    if (session?.totalCost !== 450) throw new Error(`Cost: expected 450, got ${session?.totalCost}`);
  });

  await test("Heartbeat liveness detection", async () => {
    await storage.heartbeat(sessionId, "peer-abc");
    const session = await storage.getSession(sessionId);
    if (!session?.heartbeatAt) throw new Error("Heartbeat not recorded");
    if (session?.peerId !== "peer-abc") throw new Error("Peer ID mismatch");
  });

  // ── Message Tests ──────────────────────────────────────
  console.log(chalk.cyan("\n  Messages"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Append user message", async () => {
    const msg = await storage.appendMessage({
      sessionId,
      role: "user",
      content: "Add authentication to the API",
    });
    if (!msg.id.startsWith("msg_")) throw new Error("ID should start with msg_");
    if (msg.role !== "user") throw new Error("Role mismatch");
    if (msg.orderIndex !== 0) throw new Error(`Order should be 0, got ${msg.orderIndex}`);
  });

  await test("Append assistant message", async () => {
    const msg = await storage.appendMessage({
      sessionId,
      role: "assistant",
      content: "I'll add JWT authentication. Let me first read the existing code.",
      model: "claude-sonnet-4-20250514",
      inputTokens: 150,
      outputTokens: 75,
      durationMs: 2300,
    });
    if (msg.orderIndex !== 1) throw new Error(`Order should be 1, got ${msg.orderIndex}`);
    if (msg.model !== "claude-sonnet-4-20250514") throw new Error("Model not recorded");
  });

  await test("Append tool call message", async () => {
    const msg = await storage.appendMessage({
      sessionId,
      role: "assistant",
      content: "",
      toolName: "file_read",
      toolCallId: "call_001",
      toolArgs: JSON.stringify({ path: "src/routes/index.ts" }),
    });
    if (msg.toolName !== "file_read") throw new Error("Tool name mismatch");
    if (msg.toolCallId !== "call_001") throw new Error("Tool call ID mismatch");
  });

  await test("Append tool result message", async () => {
    const msg = await storage.appendMessage({
      sessionId,
      role: "tool",
      content: "File contents of src/routes/index.ts...",
      toolCallId: "call_001",
      toolResult: JSON.stringify({ success: true, content: "..." }),
    });
    if (msg.role !== "tool") throw new Error("Role should be tool");
  });

  await test("Get session messages in order", async () => {
    const msgs = await storage.getSessionMessages(sessionId);
    if (msgs.length !== 4) throw new Error(`Expected 4 messages, got ${msgs.length}`);
    if (msgs[0].role !== "user") throw new Error("First should be user");
    if (msgs[1].role !== "assistant") throw new Error("Second should be assistant");
    if (msgs[0].orderIndex !== 0) throw new Error("Order not sequential");
    if (msgs[3].orderIndex !== 3) throw new Error("Last order should be 3");
  });

  await test("Get recent messages (limit)", async () => {
    const recent = await storage.getRecentMessages(sessionId, 2);
    if (recent.length !== 2) throw new Error(`Expected 2, got ${recent.length}`);
    if (recent[0].orderIndex !== 2) throw new Error("Should return last 2 messages");
  });

  await test("Count messages", async () => {
    const count = await storage.countMessages(sessionId);
    if (count !== 4) throw new Error(`Expected 4, got ${count}`);
  });

  // ── Snapshot Tests ─────────────────────────────────────
  console.log(chalk.cyan("\n  Snapshots"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Create snapshot", async () => {
    const snap = await storage.createSnapshot({
      sessionId,
      gitRef: "stash@{0}",
      type: "pre_edit",
      description: "Before adding auth middleware",
    });
    if (!snap.id.startsWith("snap_")) throw new Error("ID should start with snap_");
    if (snap.gitRef !== "stash@{0}") throw new Error("Git ref mismatch");
  });

  await test("Get session snapshots", async () => {
    const snaps = await storage.getSessionSnapshots(sessionId);
    if (snaps.length !== 1) throw new Error(`Expected 1 snapshot, got ${snaps.length}`);
  });

  // ── KV Store Tests ─────────────────────────────────────
  console.log(chalk.cyan("\n  Key-Value Store"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Set and get key-value", async () => {
    await storage.kvSet("last_model", "claude-sonnet-4-20250514");
    const value = await storage.kvGet("last_model");
    if (value !== "claude-sonnet-4-20250514") throw new Error("Value mismatch");
  });

  await test("Update existing key", async () => {
    await storage.kvSet("last_model", "gpt-4o");
    const value = await storage.kvGet("last_model");
    if (value !== "gpt-4o") throw new Error("Value not updated");
  });

  await test("Get non-existent key returns null", async () => {
    const value = await storage.kvGet("nonexistent");
    if (value !== null) throw new Error("Should return null");
  });

  await test("Delete key", async () => {
    await storage.kvDelete("last_model");
    const value = await storage.kvGet("last_model");
    if (value !== null) throw new Error("Should be deleted");
  });

  // ── Cascade Delete Test ────────────────────────────────
  console.log(chalk.cyan("\n  Cascade Delete"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Delete session cascades messages & snapshots", async () => {
    await storage.deleteSession(sessionId);
    const session = await storage.getSession(sessionId);
    if (session) throw new Error("Session should be deleted");
    const msgs = await storage.getSessionMessages(sessionId);
    if (msgs.length !== 0) throw new Error("Messages should be cascaded");
    const snaps = await storage.getSessionSnapshots(sessionId);
    if (snaps.length !== 0) throw new Error("Snapshots should be cascaded");
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

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error(chalk.red(`\n✖ Test runner error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
