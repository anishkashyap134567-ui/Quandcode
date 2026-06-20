#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Provider Subsystem Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import { getProviderRegistry } from "./registry.js";
import * as fs from "node:fs";
import * as path from "node:path";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")} ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode Provider Tests")} ${chalk.bold.yellowBright("⚡")}     ${chalk.cyan("║")}
${chalk.cyan("╚═══════════════════════════════════════════╝")}
`;

console.log(banner);

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void) {
  try {
    const res = fn();
    if (res instanceof Promise) {
      return res
        .then(() => {
          console.log(chalk.green(`  ✔ ${name}`));
          passed++;
        })
        .catch((err: Error) => {
          console.log(chalk.red(`  ✖ ${name}`));
          console.log(chalk.red(`    Error: ${err.message}`));
          failed++;
        });
    } else {
      console.log(chalk.green(`  ✔ ${name}`));
      passed++;
    }
  } catch (err: any) {
    console.log(chalk.red(`  ✖ ${name}`));
    console.log(chalk.red(`    Error: ${err.message}`));
    failed++;
  }
}

async function runTests() {
  const registry = getProviderRegistry();

  // ── Ollama Model Resolution ─────────────────────────────
  console.log(chalk.cyan("\n  Ollama Model Resolution"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  test("Resolve hardcoded Ollama model (llama3.1)", () => {
    const resolved = registry.resolveModel("llama3.1");
    if (!resolved) throw new Error("Failed to resolve llama3.1");
    if (resolved.provider.name !== "ollama") throw new Error("Provider should be ollama");
    if (resolved.model.id !== "llama3.1") throw new Error("Model ID mismatch");
  });

  test("Resolve prefixed Ollama model (ollama/llama3.1)", () => {
    const resolved = registry.resolveModel("ollama/llama3.1");
    if (!resolved) throw new Error("Failed to resolve ollama/llama3.1");
    if (resolved.provider.name !== "ollama") throw new Error("Provider should be ollama");
  });

  test("Dynamically resolve unregistered Ollama model (ollama/custom-model)", () => {
    const resolved = registry.resolveModel("ollama/custom-model");
    if (!resolved) throw new Error("Failed to resolve ollama/custom-model");
    if (resolved.provider.name !== "ollama") throw new Error("Provider should be ollama");
    if (resolved.model.id !== "custom-model") throw new Error("Model ID mismatch");
    if (resolved.model.contextWindow !== 128000) throw new Error("Context window default mismatch");
  });

  // ── Config Fallbacks ────────────────────────────────────
  console.log(chalk.cyan("\n  Provider Config Fallbacks"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  test("Ollama is always configured", () => {
    const provider = registry.getProvider("ollama");
    if (!provider) throw new Error("Ollama provider not registered");
    if (!provider.isConfigured()) throw new Error("Ollama should always be configured");
  });

  test("Read API Key fallback from quandcode.json", () => {
    // Write temporary quandcode.json
    const tempConfigPath = path.join(process.cwd(), "quandcode.json");
    const backupExists = fs.existsSync(tempConfigPath);
    let backupContent = "";
    if (backupExists) {
      backupContent = fs.readFileSync(tempConfigPath, "utf-8");
    }

    try {
      const testConfig = {
        provider: {
          openai: {
            apiKey: "test-openai-key-from-json"
          }
        }
      };
      fs.writeFileSync(tempConfigPath, JSON.stringify(testConfig, null, 2), "utf-8");

      // Temporarily clear environment variable to test fallback
      const oldEnvKey = process.env.OPENAI_API_KEY;
      delete process.env.OPENAI_API_KEY;

      const provider = registry.getProvider("openai");
      if (!provider) throw new Error("OpenAI provider not found");
      const configured = provider.isConfigured();

      // Restore environment
      if (oldEnvKey) process.env.OPENAI_API_KEY = oldEnvKey;

      if (!configured) throw new Error("OpenAI should be configured via quandcode.json");
    } finally {
      // Clean up/restore quandcode.json
      if (backupExists) {
        fs.writeFileSync(tempConfigPath, backupContent, "utf-8");
      } else if (fs.existsSync(tempConfigPath)) {
        fs.unlinkSync(tempConfigPath);
      }
    }
  });

  // Summary
  console.log(chalk.gray("\n" + "─".repeat(50)));
  if (failed > 0) {
    console.log(chalk.red.bold(`\n  ✖ Tests Completed: ${passed} passed, ${failed} failed.\n`));
    process.exit(1);
  } else {
    console.log(chalk.green.bold(`\n  ✔ All ${passed} provider tests passed! 🔥\n`));
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
