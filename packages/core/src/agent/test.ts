#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Agent Loop Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createTestAgent } from "./agent.js";
import type { AgentResult, AgentEvents } from "./loop.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode Agent Loop Tests")} ${chalk.bold.yellowBright("⚡")}    ${chalk.cyan("║")}
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

// ── Setup ─────────────────────────────────────────────────

const TMP_DIR = path.join(os.tmpdir(), `quandcode-agent-test-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });
fs.writeFileSync(path.join(TMP_DIR, "hello.ts"), `export const greeting = "hello";\n`, "utf-8");
fs.writeFileSync(path.join(TMP_DIR, "package.json"), `{"name":"test","version":"1.0.0"}\n`, "utf-8");

// ── Run Tests ─────────────────────────────────────────────

async function runTests() {
  // ── Single-Turn (Text Only) ────────────────────────────
  console.log(chalk.cyan("\n  Single-Turn (No Tools)"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Agent returns text response", async () => {
    const agent = createTestAgent({
      responses: [
        { content: "Hello! I'm QuandCode, your AI coding agent." },
      ],
      cwd: TMP_DIR,
    });
    const result = await agent.run("Hello");
    if (!result.response.includes("QuandCode")) throw new Error("Missing response text");
    if (result.finishReason !== "complete") throw new Error(`Expected 'complete', got '${result.finishReason}'`);
    if (result.iterations !== 1) throw new Error(`Expected 1 iteration, got ${result.iterations}`);
  });

  await test("Token tracking works", async () => {
    const agent = createTestAgent({
      responses: [
        { content: "Done." },
      ],
      cwd: TMP_DIR,
    });
    const result = await agent.run("test");
    if (result.totalTokens.input !== 100) throw new Error(`Input tokens: ${result.totalTokens.input}`);
    if (result.totalTokens.output !== 50) throw new Error(`Output tokens: ${result.totalTokens.output}`);
  });

  await test("Duration is tracked", async () => {
    const agent = createTestAgent({
      responses: [{ content: "Done." }],
      cwd: TMP_DIR,
    });
    const result = await agent.run("test");
    if (result.durationMs <= 0) throw new Error(`Duration should be positive: ${result.durationMs}`);
  });

  // ── Multi-Turn (With Tool Calls) ───────────────────────
  console.log(chalk.cyan("\n  Multi-Turn (Tool Calls)"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Agent calls file_read then responds", async () => {
    const agent = createTestAgent({
      responses: [
        {
          content: "Let me read the file first.",
          toolCalls: [
            { id: "tc_1", name: "file_read", args: { path: path.join(TMP_DIR, "hello.ts") } },
          ],
        },
        {
          content: "The file contains a greeting export.",
        },
      ],
      cwd: TMP_DIR,
    });
    const result = await agent.run("What's in hello.ts?");
    if (result.iterations !== 2) throw new Error(`Expected 2 iterations, got ${result.iterations}`);
    if (result.toolCallCount !== 1) throw new Error(`Expected 1 tool call, got ${result.toolCallCount}`);
    if (result.finishReason !== "complete") throw new Error(`Expected 'complete', got '${result.finishReason}'`);
  });

  await test("Agent calls multiple tools in one turn", async () => {
    const agent = createTestAgent({
      responses: [
        {
          content: "Reading files...",
          toolCalls: [
            { id: "tc_1", name: "file_read", args: { path: path.join(TMP_DIR, "hello.ts") } },
            { id: "tc_2", name: "file_read", args: { path: path.join(TMP_DIR, "package.json") } },
          ],
        },
        {
          content: "I've read both files.",
        },
      ],
      cwd: TMP_DIR,
    });
    const result = await agent.run("Read all files");
    if (result.toolCallCount !== 2) throw new Error(`Expected 2 tool calls, got ${result.toolCallCount}`);
  });

  await test("Agent chains 3 turns of tool calls", async () => {
    const agent = createTestAgent({
      responses: [
        {
          content: "Step 1: Reading file",
          toolCalls: [
            { id: "tc_1", name: "file_read", args: { path: path.join(TMP_DIR, "hello.ts") } },
          ],
        },
        {
          content: "Step 2: Listing directory",
          toolCalls: [
            { id: "tc_2", name: "list_dir", args: { path: TMP_DIR } },
          ],
        },
        {
          content: "Step 3: Searching for pattern",
          toolCalls: [
            { id: "tc_3", name: "grep", args: { pattern: "greeting", path: TMP_DIR } },
          ],
        },
        {
          content: "All done! Found the greeting export in hello.ts.",
        },
      ],
      cwd: TMP_DIR,
    });
    const result = await agent.run("Analyze the project");
    if (result.iterations !== 4) throw new Error(`Expected 4 iterations, got ${result.iterations}`);
    if (result.toolCallCount !== 3) throw new Error(`Expected 3 tool calls, got ${result.toolCallCount}`);
    if (result.totalTokens.input !== 400) throw new Error(`Expected 400 input tokens, got ${result.totalTokens.input}`);
  });

  // ── Tool Execution ─────────────────────────────────────
  console.log(chalk.cyan("\n  Tool Execution Integration"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("file_read returns real file contents", async () => {
    let toolOutput = "";
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "file_read", args: { path: path.join(TMP_DIR, "hello.ts") } },
          ],
        },
        { content: "Got it." },
      ],
      cwd: TMP_DIR,
      events: {
        onToolResult: (result) => {
          toolOutput = result.result.output;
        },
      },
    });
    await agent.run("Read hello.ts");
    if (!toolOutput.includes("greeting")) throw new Error("Tool should read actual file content");
  });

  await test("file_write creates real file", async () => {
    const newFile = path.join(TMP_DIR, "agent_created.ts");
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "file_write", args: { path: newFile, content: "export const x = 42;\n" } },
          ],
        },
        { content: "File created." },
      ],
      cwd: TMP_DIR,
    });
    await agent.run("Create a file");
    if (!fs.existsSync(newFile)) throw new Error("File should have been created");
    const content = fs.readFileSync(newFile, "utf-8");
    if (!content.includes("42")) throw new Error("File content mismatch");
  });

  await test("file_edit modifies real file", async () => {
    const editFile = path.join(TMP_DIR, "edit_target.ts");
    fs.writeFileSync(editFile, 'const x = "old";\n', "utf-8");
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "file_edit", args: { path: editFile, oldText: '"old"', newText: '"new"' } },
          ],
        },
        { content: "Edited." },
      ],
      cwd: TMP_DIR,
    });
    await agent.run("Update the value");
    const content = fs.readFileSync(editFile, "utf-8");
    if (!content.includes('"new"')) throw new Error("Edit not applied");
  });

  await test("grep finds real matches", async () => {
    let matchCount = 0;
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "grep", args: { pattern: "export", path: TMP_DIR } },
          ],
        },
        { content: "Found matches." },
      ],
      cwd: TMP_DIR,
      events: {
        onToolResult: (result) => {
          matchCount = (result.result.data as any)?.matchCount || 0;
        },
      },
    });
    await agent.run("Find exports");
    if (matchCount < 1) throw new Error(`Expected at least 1 match, got ${matchCount}`);
  });

  // ── Event Callbacks ────────────────────────────────────
  console.log(chalk.cyan("\n  Event Callbacks"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("onStart fires", async () => {
    let started = false;
    const agent = createTestAgent({
      responses: [{ content: "Hi." }],
      cwd: TMP_DIR,
      events: { onStart: () => { started = true; } },
    });
    await agent.run("test");
    if (!started) throw new Error("onStart not called");
  });

  await test("onLLMRequest fires with iteration count", async () => {
    let iteration = 0;
    const agent = createTestAgent({
      responses: [{ content: "Hi." }],
      cwd: TMP_DIR,
      events: { onLLMRequest: (i) => { iteration = i; } },
    });
    await agent.run("test");
    if (iteration !== 1) throw new Error(`Expected iteration 1, got ${iteration}`);
  });

  await test("onLLMText fires with response text", async () => {
    let text = "";
    const agent = createTestAgent({
      responses: [{ content: "The answer is 42." }],
      cwd: TMP_DIR,
      events: { onLLMText: (t) => { text = t; } },
    });
    await agent.run("test");
    if (!text.includes("42")) throw new Error("Text not received");
  });

  await test("onToolCalls fires with call details", async () => {
    let callNames: string[] = [];
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "file_read", args: { path: path.join(TMP_DIR, "hello.ts") } },
          ],
        },
        { content: "Done." },
      ],
      cwd: TMP_DIR,
      events: { onToolCalls: (calls) => { callNames = calls.map(c => c.name); } },
    });
    await agent.run("test");
    if (!callNames.includes("file_read")) throw new Error("Tool call not reported");
  });

  await test("onComplete fires with result", async () => {
    let completed = false;
    const agent = createTestAgent({
      responses: [{ content: "Done." }],
      cwd: TMP_DIR,
      events: { onComplete: () => { completed = true; } },
    });
    await agent.run("test");
    if (!completed) throw new Error("onComplete not called");
  });

  // ── Error Handling ─────────────────────────────────────
  console.log(chalk.cyan("\n  Error Handling"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("LLM error returns error result", async () => {
    let errorSeen = false;
    const agent = createTestAgent({
      responses: [],
      cwd: TMP_DIR,
      events: { onError: () => { errorSeen = true; } },
    });

    // Override generateFn to throw
    (agent as any).generateFn = async () => {
      throw new Error("API rate limit exceeded");
    };

    const result = await agent.run("test");
    if (result.finishReason !== "error") throw new Error(`Expected 'error', got '${result.finishReason}'`);
    if (!result.error?.includes("rate limit")) throw new Error("Error message missing");
  });

  await test("Unknown tool call returns error to LLM", async () => {
    let toolError = "";
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "nonexistent_tool", args: {} },
          ],
        },
        { content: "OK, that tool doesn't exist." },
      ],
      cwd: TMP_DIR,
      events: {
        onToolResult: (result) => {
          if (!result.result.success) toolError = result.result.error || "";
        },
      },
    });
    const result = await agent.run("test");
    if (result.finishReason !== "complete") throw new Error("Should still complete");
    if (!toolError.includes("Unknown tool")) throw new Error("Should report unknown tool error");
  });

  // ── Agent Mode ─────────────────────────────────────────
  console.log(chalk.cyan("\n  Agent Mode (Build vs Plan)"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Build mode allows write tools", async () => {
    const newFile = path.join(TMP_DIR, "build_mode_test.ts");
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "file_write", args: { path: newFile, content: "build\n" } },
          ],
        },
        { content: "Written." },
      ],
      cwd: TMP_DIR,
      mode: "build",
    });
    const result = await agent.run("Write a file");
    if (result.finishReason !== "complete") throw new Error("Should complete");
    if (!fs.existsSync(newFile)) throw new Error("File should be created in build mode");
  });

  await test("Plan mode blocks write tools", async () => {
    let blocked = false;
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "file_write", args: { path: path.join(TMP_DIR, "plan_test.ts"), content: "x" } },
          ],
        },
        { content: "OK, I can't write in plan mode." },
      ],
      cwd: TMP_DIR,
      mode: "plan",
      events: {
        onToolResult: (result) => {
          if (result.permissionDenied) blocked = true;
        },
      },
    });
    const result = await agent.run("Write a file");
    if (!blocked) throw new Error("Write should be blocked in plan mode");
  });

  await test("Plan mode allows read tools", async () => {
    let readSuccess = false;
    const agent = createTestAgent({
      responses: [
        {
          content: "",
          toolCalls: [
            { id: "tc_1", name: "file_read", args: { path: path.join(TMP_DIR, "hello.ts") } },
          ],
        },
        { content: "Read successfully." },
      ],
      cwd: TMP_DIR,
      mode: "plan",
      events: {
        onToolResult: (result) => {
          if (result.result.success) readSuccess = true;
        },
      },
    });
    await agent.run("Read hello.ts");
    if (!readSuccess) throw new Error("Read should work in plan mode");
  });

  await test("Agent can switch from Build to Plan mode via tool", async () => {
    let modeSwitchedTo = "";
    const agent = createTestAgent({
      responses: [
        {
          content: "Let me switch to plan mode.",
          toolCalls: [
            { id: "tc_1", name: "plan_enter", args: { reason: "Need to explore" } },
          ],
        },
        { content: "I am now planning." },
      ],
      cwd: TMP_DIR,
      mode: "build",
      events: {
        onModeSwitch: (mode) => {
          modeSwitchedTo = mode;
        },
      },
    });
    await agent.run("Switch mode");
    if (modeSwitchedTo !== "plan") throw new Error("Agent did not switch to plan mode");
  });

  await test("Agent can switch from Plan to Build mode via tool", async () => {
    let modeSwitchedTo = "";
    const agent = createTestAgent({
      responses: [
        {
          content: "Let me switch to build mode.",
          toolCalls: [
            { id: "tc_1", name: "plan_exit", args: { plan: "My brilliant plan" } },
          ],
        },
        { content: "I am now building." },
      ],
      cwd: TMP_DIR,
      mode: "plan",
      events: {
        onModeSwitch: (mode) => {
          modeSwitchedTo = mode;
        },
      },
    });
    await agent.run("Switch mode");
    if (modeSwitchedTo !== "build") throw new Error("Agent did not switch to build mode");
  });

  // ── Cleanup ────────────────────────────────────────────
  fs.rmSync(TMP_DIR, { recursive: true, force: true });

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
