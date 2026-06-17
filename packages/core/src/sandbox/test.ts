#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Sandbox Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import { SandboxClient } from "./client.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode Sandbox Tests")} ${chalk.bold.yellowBright("⚡")}       ${chalk.cyan("║")}
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
  const client = new SandboxClient();

  // Test 1: Basic execution
  await test("Basic execution (echo)", async () => {
    const isWindows = process.platform === "win32";
    const result = await client.execute({
      command: isWindows ? "cmd" : "echo",
      args: isWindows ? ["/c", "echo", "hello sandbox"] : ["hello sandbox"],
      cwd: process.cwd(),
      config: {
        writable_paths: [],
        network_allowlist: [],
        env_vars: [],
        timeout_seconds: 5,
      },
    });

    if (result.exit_code !== 0) throw new Error(`Exit code: ${result.exit_code}, Stderr: ${result.stderr}`);
    if (!result.stdout.includes("hello sandbox")) throw new Error(`Stdout didn't match: ${result.stdout}`);
  });

  // Test 2: Timeout
  await test("Timeout enforcement", async () => {
    const isWindows = process.platform === "win32";
    
    // We try to run a command that blocks for a long time
    const result = await client.execute({
      command: isWindows ? "powershell" : "sleep",
      args: isWindows ? ["-Command", "Start-Sleep -Seconds 10"] : ["10"],
      cwd: process.cwd(),
      config: {
        writable_paths: [],
        network_allowlist: [],
        env_vars: [],
        timeout_seconds: 2, // Should timeout before 10s
      },
    });

    if (!result.timed_out) throw new Error("Expected timeout to occur");
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
