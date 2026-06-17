#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Tool System Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import { z } from "zod";
import { ToolRegistry } from "./registry.js";
import { PermissionManager } from "./permissions.js";
import type { ToolDefinition, ToolContext, ToolCall } from "./types.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode Tool System Tests")} ${chalk.bold.yellowBright("⚡")}   ${chalk.cyan("║")}
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

// ── Helper: create mock tools ─────────────────────────────

function createMockReadTool(): ToolDefinition {
  return {
    name: "file_read",
    description: "Read file contents",
    parameters: z.object({
      path: z.string().describe("Path to the file"),
      startLine: z.number().optional().describe("Start line"),
      endLine: z.number().optional().describe("End line"),
    }),
    category: "filesystem",
    isConcurrencySafe: true,
    isReadOnly: true,
    execute: async (args) => ({
      success: true,
      output: `Contents of ${args.path}: hello world`,
    }),
  };
}

function createMockWriteTool(): ToolDefinition {
  return {
    name: "file_write",
    description: "Write to a file",
    parameters: z.object({
      path: z.string().describe("File path"),
      content: z.string().describe("File content"),
    }),
    category: "filesystem",
    isConcurrencySafe: false,
    isReadOnly: false,
    execute: async (args) => ({
      success: true,
      output: `Wrote ${args.content.length} chars to ${args.path}`,
    }),
  };
}

function createMockBashTool(): ToolDefinition {
  return {
    name: "bash",
    description: "Execute shell commands",
    parameters: z.object({
      command: z.string().describe("Command to execute"),
      cwd: z.string().optional().describe("Working directory"),
      timeout: z.number().default(30000).describe("Timeout in ms"),
    }),
    category: "execution",
    isConcurrencySafe: false,
    isReadOnly: false,
    execute: async (args) => ({
      success: true,
      output: `Executed: ${args.command}`,
    }),
  };
}

function createMockGrepTool(): ToolDefinition {
  return {
    name: "grep",
    description: "Search for patterns in files",
    parameters: z.object({
      pattern: z.string().describe("Search pattern"),
      path: z.string().optional().describe("Search path"),
      flags: z.string().optional().describe("Grep flags"),
    }),
    category: "filesystem",
    isConcurrencySafe: true,
    isReadOnly: true,
    execute: async (args) => ({
      success: true,
      output: `Found 3 matches for "${args.pattern}"`,
    }),
  };
}

function createTestContext(overrides?: Partial<ToolContext>): ToolContext {
  return {
    cwd: "/tmp/test",
    sessionId: "ses_test123",
    agentMode: "build",
    checkPermission: async () => ({ allowed: true }),
    ...overrides,
  };
}

// ── Run Tests ─────────────────────────────────────────────

async function runTests() {
  // ── Registration ───────────────────────────────────────
  console.log(chalk.cyan("\n  Tool Registration"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Register a tool", () => {
    const registry = new ToolRegistry();
    registry.register(createMockReadTool());
    if (!registry.has("file_read")) throw new Error("Tool not found");
    if (registry.size !== 1) throw new Error(`Expected 1 tool, got ${registry.size}`);
  });

  await test("Register multiple tools", () => {
    const registry = new ToolRegistry();
    registry.registerAll([
      createMockReadTool(),
      createMockWriteTool(),
      createMockBashTool(),
      createMockGrepTool(),
    ]);
    if (registry.size !== 4) throw new Error(`Expected 4 tools, got ${registry.size}`);
  });

  await test("Reject duplicate registration", () => {
    const registry = new ToolRegistry();
    registry.register(createMockReadTool());
    try {
      registry.register(createMockReadTool());
      throw new Error("Should have thrown");
    } catch (e: any) {
      if (!e.message.includes("already registered")) throw e;
    }
  });

  await test("Unregister a tool", () => {
    const registry = new ToolRegistry();
    registry.register(createMockReadTool());
    registry.unregister("file_read");
    if (registry.has("file_read")) throw new Error("Should be removed");
  });

  await test("List tools by category", () => {
    const registry = new ToolRegistry();
    registry.registerAll([
      createMockReadTool(),
      createMockWriteTool(),
      createMockBashTool(),
      createMockGrepTool(),
    ]);
    const fs = registry.listByCategory("filesystem");
    if (fs.length !== 3) throw new Error(`Expected 3 filesystem tools, got ${fs.length}`);
    const exec = registry.listByCategory("execution");
    if (exec.length !== 1) throw new Error(`Expected 1 execution tool, got ${exec.length}`);
  });

  // ── Validation ─────────────────────────────────────────
  console.log(chalk.cyan("\n  Zod Validation"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Valid arguments pass validation", () => {
    const registry = new ToolRegistry();
    registry.register(createMockReadTool());
    const result = registry.validate("file_read", { path: "src/index.ts" });
    if (!result.valid) throw new Error(`Should be valid: ${(result as any).error}`);
  });

  await test("Missing required field fails validation", () => {
    const registry = new ToolRegistry();
    registry.register(createMockReadTool());
    const result = registry.validate("file_read", {});
    if (result.valid) throw new Error("Should fail — path is required");
  });

  await test("Wrong type fails validation", () => {
    const registry = new ToolRegistry();
    registry.register(createMockReadTool());
    const result = registry.validate("file_read", { path: 42 });
    if (result.valid) throw new Error("Should fail — path must be string");
  });

  await test("Optional fields are accepted", () => {
    const registry = new ToolRegistry();
    registry.register(createMockReadTool());
    const result = registry.validate("file_read", { path: "test.ts", startLine: 10, endLine: 20 });
    if (!result.valid) throw new Error(`Should be valid: ${(result as any).error}`);
  });

  await test("Default values are applied", () => {
    const registry = new ToolRegistry();
    registry.register(createMockBashTool());
    const result = registry.validate("bash", { command: "ls" });
    if (!result.valid) throw new Error(`Should be valid: ${(result as any).error}`);
    if ((result as any).args.timeout !== 30000) throw new Error("Default not applied");
  });

  await test("Unknown tool fails validation", () => {
    const registry = new ToolRegistry();
    const result = registry.validate("nonexistent", {});
    if (result.valid) throw new Error("Should fail for unknown tool");
  });

  // ── Permissions ────────────────────────────────────────
  console.log(chalk.cyan("\n  Permission System"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Read tools default to 'allow'", async () => {
    const pm = new PermissionManager();
    const result = await pm.checkPermission("file_read");
    if (!result.allowed) throw new Error("file_read should be allowed");
  });

  await test("Write tools default to 'ask'", async () => {
    const pm = new PermissionManager();
    const level = pm.getPermissionLevel("file_write");
    if (level !== "ask") throw new Error(`Expected 'ask', got '${level}'`);
  });

  await test("Bash defaults to 'ask'", async () => {
    const pm = new PermissionManager();
    const level = pm.getPermissionLevel("bash");
    if (level !== "ask") throw new Error(`Expected 'ask', got '${level}'`);
  });

  await test("Auto-approve bypasses 'ask'", async () => {
    const pm = new PermissionManager({ autoApprove: true });
    const result = await pm.checkPermission("bash");
    if (!result.allowed) throw new Error("Should be allowed with --yes");
  });

  await test("Deny blocks execution", async () => {
    const pm = new PermissionManager({
      permissions: { bash: "deny" },
    });
    const result = await pm.checkPermission("bash");
    if (result.allowed) throw new Error("Should be denied");
  });

  await test("Ask with callback approved", async () => {
    const pm = new PermissionManager({
      askCallback: async () => true,
    });
    const result = await pm.checkPermission("file_write");
    if (!result.allowed) throw new Error("Should be allowed when user approves");
  });

  await test("Ask with callback denied", async () => {
    const pm = new PermissionManager({
      askCallback: async () => false,
    });
    const result = await pm.checkPermission("file_write");
    if (result.allowed) throw new Error("Should be denied when user rejects");
  });

  await test("Override permission", async () => {
    const pm = new PermissionManager();
    pm.setPermission("bash", "allow");
    const result = await pm.checkPermission("bash");
    if (!result.allowed) throw new Error("Override should take effect");
  });

  await test("Plan mode blocks write tools", () => {
    const pm = new PermissionManager();
    const writeTool = createMockWriteTool();
    const result = pm.checkAgentMode(writeTool, "plan");
    if (result.allowed) throw new Error("Write tools should be blocked in plan mode");
  });

  await test("Plan mode allows read tools", () => {
    const pm = new PermissionManager();
    const readTool = createMockReadTool();
    const result = pm.checkAgentMode(readTool, "plan");
    if (!result.allowed) throw new Error("Read tools should be allowed in plan mode");
  });

  await test("Build mode allows all tools", () => {
    const pm = new PermissionManager();
    const writeTool = createMockWriteTool();
    const result = pm.checkAgentMode(writeTool, "build");
    if (!result.allowed) throw new Error("All tools should be allowed in build mode");
  });

  await test("Permission summary lists all tools", () => {
    const pm = new PermissionManager();
    const summary = pm.getSummary();
    if (summary.length < 5) throw new Error(`Expected at least 5 defaults, got ${summary.length}`);
  });

  // ── Execution ──────────────────────────────────────────
  console.log(chalk.cyan("\n  Tool Execution"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Execute tool successfully", async () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);
    registry.register(createMockReadTool());

    const call: ToolCall = { id: "call_1", name: "file_read", rawArgs: { path: "src/index.ts" } };
    const ctx = createTestContext();
    const result = await registry.executeTool(call, ctx);

    if (!result.result.success) throw new Error("Should succeed");
    if (!result.result.output.includes("src/index.ts")) throw new Error("Output should contain path");
  });

  await test("Execute with validation error", async () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);
    registry.register(createMockReadTool());

    const call: ToolCall = { id: "call_2", name: "file_read", rawArgs: {} };
    const ctx = createTestContext();
    const result = await registry.executeTool(call, ctx);

    if (result.result.success) throw new Error("Should fail validation");
    if (!result.validationError) throw new Error("Should have validation error");
  });

  await test("Execute unknown tool", async () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);

    const call: ToolCall = { id: "call_3", name: "nonexistent", rawArgs: {} };
    const ctx = createTestContext();
    const result = await registry.executeTool(call, ctx);

    if (result.result.success) throw new Error("Should fail");
    if (!result.result.error?.includes("Unknown tool")) throw new Error("Should mention unknown tool");
  });

  await test("Execute blocked by plan mode", async () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);
    registry.register(createMockWriteTool());

    const call: ToolCall = { id: "call_4", name: "file_write", rawArgs: { path: "test.txt", content: "hi" } };
    const ctx = createTestContext({ agentMode: "plan" });
    const result = await registry.executeTool(call, ctx);

    if (result.result.success) throw new Error("Should be blocked");
    if (!result.permissionDenied) throw new Error("Should flag permission denied");
  });

  await test("Execute blocked by deny permission", async () => {
    const pm = new PermissionManager({ permissions: { bash: "deny" } });
    const registry = new ToolRegistry(pm);
    registry.register(createMockBashTool());

    const call: ToolCall = { id: "call_5", name: "bash", rawArgs: { command: "rm -rf /" } };
    const ctx = createTestContext();
    const result = await registry.executeTool(call, ctx);

    if (result.result.success) throw new Error("Should be denied");
    if (!result.permissionDenied) throw new Error("Should flag permission denied");
  });

  await test("Execute multiple tool calls (concurrent + sequential)", async () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);
    registry.registerAll([createMockReadTool(), createMockGrepTool(), createMockWriteTool()]);

    const calls: ToolCall[] = [
      { id: "c1", name: "file_read", rawArgs: { path: "a.ts" } },
      { id: "c2", name: "grep", rawArgs: { pattern: "TODO" } },
      { id: "c3", name: "file_write", rawArgs: { path: "b.ts", content: "new" } },
    ];
    const ctx = createTestContext();
    const results = await registry.executeToolCalls(calls, ctx);

    if (results.length !== 3) throw new Error(`Expected 3 results, got ${results.length}`);
    if (!results.every((r) => r.result.success)) throw new Error("All should succeed");
  });

  await test("Tool execution error is caught", async () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);

    const errorTool: ToolDefinition = {
      name: "crasher",
      description: "Always throws",
      parameters: z.object({}),
      category: "custom",
      isConcurrencySafe: true,
      isReadOnly: false,
      execute: async () => { throw new Error("Kaboom!"); },
    };
    registry.register(errorTool);

    const call: ToolCall = { id: "crash", name: "crasher", rawArgs: {} };
    const ctx = createTestContext();
    const result = await registry.executeTool(call, ctx);

    if (result.result.success) throw new Error("Should fail");
    if (!result.result.error?.includes("Kaboom")) throw new Error("Error not captured");
  });

  // ── JSON Schema Generation ─────────────────────────────
  console.log(chalk.cyan("\n  JSON Schema Generation"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Generate schemas for build mode", () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);
    registry.registerAll([createMockReadTool(), createMockWriteTool(), createMockBashTool()]);

    const schemas = registry.generateToolSchemas("build");
    if (schemas.length !== 3) throw new Error(`Expected 3 schemas, got ${schemas.length}`);
    if (!schemas[0].parameters) throw new Error("Should have parameters");
  });

  await test("Generate schemas for plan mode (only read-only)", () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);
    registry.registerAll([createMockReadTool(), createMockWriteTool(), createMockGrepTool()]);

    const schemas = registry.generateToolSchemas("plan");
    if (schemas.length !== 2) throw new Error(`Expected 2 plan schemas, got ${schemas.length}`);
    const names = schemas.map((s) => s.name);
    if (names.includes("file_write")) throw new Error("Write tool should not be in plan mode schemas");
  });

  await test("JSON Schema has correct structure", () => {
    const pm = new PermissionManager({ autoApprove: true });
    const registry = new ToolRegistry(pm);
    registry.register(createMockReadTool());

    const schemas = registry.generateToolSchemas();
    const schema = schemas[0];
    const params = schema.parameters as Record<string, unknown>;

    if (params.type !== "object") throw new Error("Should be object type");
    const props = params.properties as Record<string, any>;
    if (!props.path) throw new Error("Should have 'path' property");
    if (props.path.type !== "string") throw new Error("path should be string type");
    const required = params.required as string[];
    if (!required.includes("path")) throw new Error("path should be required");
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
