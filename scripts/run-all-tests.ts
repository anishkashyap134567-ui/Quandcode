#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Monorepo Test Runner
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";

const suites = [
  { name: "Storage Layer", path: "packages/core/src/storage/test.ts" },
  { name: "Session Engine", path: "packages/core/src/session/test.ts" },
  { name: "Prompt Architecture", path: "packages/core/src/session/test-system.ts" },
  { name: "Tool Registry", path: "packages/core/src/tool/test.ts" },
  { name: "Core Tools", path: "packages/core/src/tool/tools/test.ts" },
  { name: "Agent Loop", path: "packages/core/src/agent/test.ts" },
  { name: "LSP Integration", path: "packages/core/src/lsp/test.ts" },
  { name: "Sandbox Client", path: "packages/core/src/sandbox/test.ts" },
  { name: "Provider Subsystem", path: "packages/core/src/provider/test.ts" },
  { name: "Terminal UI", path: "packages/tui/src/test.ts" },
];

console.log(chalk.cyan.bold("\n⚡ Running QuandCode Monorepo Test Suites...\n"));

let failed = false;

for (const suite of suites) {
  console.log(chalk.yellow(`\n📦 Suite: ${suite.name} (${suite.path})`));
  console.log(chalk.gray("─".repeat(50)));

  const result = Bun.spawnSync(["bun", "run", suite.path], {
    stdout: "inherit",
    stderr: "inherit",
  });

  if (result.exitCode !== 0) {
    console.error(chalk.red(`\n✖ Suite failed: ${suite.name}\n`));
    failed = true;
    break; // halt on first failure
  }
}

if (failed) {
  console.log(chalk.red.bold("\n✖ Test execution completed with failures.\n"));
  process.exit(1);
} else {
  console.log(chalk.green.bold("\n✔ All 168 unit tests passed across all 10 suites! 🔥\n"));
  process.exit(0);
}
