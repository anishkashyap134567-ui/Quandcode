#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Core Tools Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { ToolRegistry } from "../registry.js";
import { PermissionManager } from "../permissions.js";
import { registerCoreTools, CORE_TOOLS } from "./index.js";
import type { ToolCall, ToolContext } from "../types.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode Core Tools Tests")} ${chalk.bold.yellowBright("⚡")}    ${chalk.cyan("║")}
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

// ── Setup: create temp directory with test files ──────────

const TMP_DIR = path.join(os.tmpdir(), `quandcode-test-${Date.now()}`);
fs.mkdirSync(TMP_DIR, { recursive: true });

// Create test files
fs.writeFileSync(path.join(TMP_DIR, "hello.ts"), `export function greet(name: string): string {\n  return \`Hello, \${name}!\`;\n}\n\nexport const VERSION = "1.0.0";\n`, "utf-8");
fs.writeFileSync(path.join(TMP_DIR, "math.ts"), `export function add(a: number, b: number): number {\n  return a + b;\n}\n\nexport function multiply(a: number, b: number): number {\n  return a * b;\n}\n`, "utf-8");
fs.mkdirSync(path.join(TMP_DIR, "src"), { recursive: true });
fs.writeFileSync(path.join(TMP_DIR, "src", "index.ts"), `import { greet } from "../hello";\nconsole.log(greet("World"));\n// TODO: add more features\n`, "utf-8");
fs.writeFileSync(path.join(TMP_DIR, "src", "utils.ts"), `// Utility functions\nexport function isEmpty(str: string): boolean {\n  return str.trim().length === 0;\n}\n// TODO: add more utils\n`, "utf-8");
fs.writeFileSync(path.join(TMP_DIR, "package.json"), `{\n  "name": "test-project",\n  "version": "1.0.0"\n}\n`, "utf-8");

// ── Create registry ───────────────────────────────────────

function createRegistry(): ToolRegistry {
  const pm = new PermissionManager({ autoApprove: true });
  const registry = new ToolRegistry(pm);
  registerCoreTools(registry);
  return registry;
}

function createCtx(overrides?: Partial<ToolContext>): ToolContext {
  return {
    cwd: TMP_DIR,
    sessionId: "ses_test",
    agentMode: "build",
    checkPermission: async () => ({ allowed: true }),
    ...overrides,
  };
}

async function exec(registry: ToolRegistry, name: string, args: Record<string, unknown>, ctx?: ToolContext) {
  const call: ToolCall = { id: `call_${Date.now()}`, name, rawArgs: args };
  return registry.executeTool(call, ctx || createCtx());
}

// ── Run Tests ─────────────────────────────────────────────

async function runTests() {
  // ── Registration ───────────────────────────────────────
  console.log(chalk.cyan("\n  Registration"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("All 10 core tools registered", () => {
    const registry = createRegistry();
    if (registry.size !== 10) throw new Error(`Expected 10 tools, got ${registry.size}`);
  });

  await test("CORE_TOOLS array has 10 entries", () => {
    if (CORE_TOOLS.length !== 10) throw new Error(`Expected 10, got ${CORE_TOOLS.length}`);
  });

  await test("Tool names match expected set", () => {
    const names = CORE_TOOLS.map(t => t.name).sort();
    const expected = ["bash", "file_edit", "file_read", "file_write", "glob", "grep", "list_dir", "lsp_query", "plan_enter", "plan_exit"];
    if (JSON.stringify(names) !== JSON.stringify(expected)) {
      throw new Error(`Names: ${names.join(", ")}`);
    }
  });

  await test("Read-only tools are marked correctly", () => {
    const readOnly = CORE_TOOLS.filter(t => t.isReadOnly).map(t => t.name).sort();
    const expected = ["file_read", "glob", "grep", "list_dir", "lsp_query", "plan_enter", "plan_exit"];
    if (JSON.stringify(readOnly) !== JSON.stringify(expected)) {
      throw new Error(`Read-only: ${readOnly.join(", ")}`);
    }
  });

  // ── file_read ──────────────────────────────────────────
  console.log(chalk.cyan("\n  file_read"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Read existing file", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_read", { path: "hello.ts" });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("greet")) throw new Error("Should contain function name");
    if (!result.result.output.includes("1:")) throw new Error("Should have line numbers");
  });

  await test("Read with line range", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_read", { path: "hello.ts", startLine: 2, endLine: 3 });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("lines 2-3")) throw new Error("Should show range info");
  });

  await test("Read non-existent file fails", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_read", { path: "nonexistent.ts" });
    if (result.result.success) throw new Error("Should fail");
    if (!result.result.error?.includes("not found")) throw new Error("Should mention not found");
  });

  await test("Read with absolute path", async () => {
    const registry = createRegistry();
    const absPath = path.join(TMP_DIR, "hello.ts");
    const result = await exec(registry, "file_read", { path: absPath });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
  });

  // ── file_write ─────────────────────────────────────────
  console.log(chalk.cyan("\n  file_write"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Write new file", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_write", {
      path: "new_file.ts",
      content: "export const x = 42;\n",
    });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!fs.existsSync(path.join(TMP_DIR, "new_file.ts"))) throw new Error("File not created");
    if (!result.result.output.includes("Created")) throw new Error("Should say Created");
  });

  await test("Refuse to overwrite without flag", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_write", {
      path: "hello.ts",
      content: "overwritten",
    });
    if (result.result.success) throw new Error("Should fail without overwrite flag");
  });

  await test("Overwrite with flag", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_write", {
      path: "new_file.ts",
      content: "export const x = 99;\n",
      overwrite: true,
    });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    const content = fs.readFileSync(path.join(TMP_DIR, "new_file.ts"), "utf-8");
    if (!content.includes("99")) throw new Error("File not overwritten");
  });

  await test("Auto-create parent directories", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_write", {
      path: "deep/nested/dir/file.ts",
      content: "nested\n",
    });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!fs.existsSync(path.join(TMP_DIR, "deep", "nested", "dir", "file.ts")))
      throw new Error("Nested dirs not created");
  });

  // ── file_edit ──────────────────────────────────────────
  console.log(chalk.cyan("\n  file_edit"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Edit: replace text in file", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_edit", {
      path: "hello.ts",
      oldText: '"1.0.0"',
      newText: '"2.0.0"',
    });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    const content = fs.readFileSync(path.join(TMP_DIR, "hello.ts"), "utf-8");
    if (!content.includes("2.0.0")) throw new Error("Edit not applied");
    if (content.includes("1.0.0")) throw new Error("Old text still present");
  });

  await test("Edit: text not found fails", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "file_edit", {
      path: "hello.ts",
      oldText: "this text does not exist",
      newText: "replacement",
    });
    if (result.result.success) throw new Error("Should fail");
    if (!result.result.error?.includes("not found")) throw new Error("Should mention not found");
  });

  await test("Edit: ambiguous match fails without replaceAll", async () => {
    // math.ts has "number" multiple times
    const registry = createRegistry();
    const result = await exec(registry, "file_edit", {
      path: "math.ts",
      oldText: "number",
      newText: "bigint",
    });
    if (result.result.success) throw new Error("Should fail with ambiguous match");
    if (!result.result.error?.includes("occurrences")) throw new Error("Should mention multiple occurrences");
  });

  await test("Edit: replaceAll works", async () => {
    // Create a fresh file for this test
    fs.writeFileSync(path.join(TMP_DIR, "replace_test.ts"), "aaa bbb aaa bbb aaa", "utf-8");
    const registry = createRegistry();
    const result = await exec(registry, "file_edit", {
      path: "replace_test.ts",
      oldText: "aaa",
      newText: "ccc",
      replaceAll: true,
    });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    const content = fs.readFileSync(path.join(TMP_DIR, "replace_test.ts"), "utf-8");
    if (content.includes("aaa")) throw new Error("Not all replaced");
    if ((result.result.data as any).replacementCount !== 3) throw new Error("Should have 3 replacements");
  });

  await test("Edit: shows diff preview", async () => {
    fs.writeFileSync(path.join(TMP_DIR, "diff_test.ts"), "const x = 1;", "utf-8");
    const registry = createRegistry();
    const result = await exec(registry, "file_edit", {
      path: "diff_test.ts",
      oldText: "const x = 1;",
      newText: "const x = 42;",
    });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("- const x = 1;")) throw new Error("Missing old diff line");
    if (!result.result.output.includes("+ const x = 42;")) throw new Error("Missing new diff line");
  });

  // ── grep ───────────────────────────────────────────────
  console.log(chalk.cyan("\n  grep"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Grep: find pattern across files", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "grep", { pattern: "TODO" });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("TODO")) throw new Error("Should find TODO");
    const data = result.result.data as any;
    if (data.matchCount < 2) throw new Error(`Expected at least 2 matches, got ${data.matchCount}`);
  });

  await test("Grep: filter by file extension", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "grep", { pattern: "name", include: "*.json" });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("package.json")) throw new Error("Should find in package.json");
  });

  await test("Grep: case-insensitive search", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "grep", { pattern: "export", caseSensitive: false });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    const data = result.result.data as any;
    if (data.matchCount < 1) throw new Error("Should find matches");
  });

  await test("Grep: no results returns success", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "grep", { pattern: "zzz_nonexistent_pattern_zzz" });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("No matches")) throw new Error("Should say no matches");
  });

  // ── glob ───────────────────────────────────────────────
  console.log(chalk.cyan("\n  glob"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Glob: find TypeScript files", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "glob", { pattern: "**/*.ts" });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    const data = result.result.data as any;
    if (data.fileCount < 3) throw new Error(`Expected at least 3 .ts files, got ${data.fileCount}`);
  });

  await test("Glob: find JSON files", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "glob", { pattern: "*.json" });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("package.json")) throw new Error("Should find package.json");
  });

  await test("Glob: no results returns success", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "glob", { pattern: "*.xyz" });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("No files")) throw new Error("Should say no files");
  });

  // ── list_dir ───────────────────────────────────────────
  console.log(chalk.cyan("\n  list_dir"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("List directory contents", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "list_dir", { path: "." });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("src/")) throw new Error("Should show src directory");
    if (!result.result.output.includes("hello.ts")) throw new Error("Should show hello.ts");
  });

  await test("List with recursive tree", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "list_dir", { path: ".", recursive: true });
    if (!result.result.success) throw new Error(result.result.error || "Failed");
    if (!result.result.output.includes("├── ") || !result.result.output.includes("└── "))
      throw new Error("Should have tree connectors");
    if (!result.result.output.includes("index.ts")) throw new Error("Should show nested files");
  });

  await test("List non-existent directory fails", async () => {
    const registry = createRegistry();
    const result = await exec(registry, "list_dir", { path: "nonexistent" });
    if (result.result.success) throw new Error("Should fail");
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
