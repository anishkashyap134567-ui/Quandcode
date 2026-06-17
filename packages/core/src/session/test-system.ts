#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — System Prompt Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import {
  buildSystemPrompt,
  buildMinimalPrompt,
  estimatePromptTokens,
} from "./system.js";
import type { SystemPromptOptions } from "./system.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode Prompt Tests")} ${chalk.bold.yellowBright("⚡")}        ${chalk.cyan("║")}
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
        .catch((err: Error) => { console.log(chalk.red(`  ✖ ${name}`)); console.log(chalk.red(`    Error: ${err.message}`)); failed++; });
    }
    console.log(chalk.green(`  ✔ ${name}`));
    passed++;
    return Promise.resolve();
  } catch (err: any) {
    console.log(chalk.red(`  ✖ ${name}`));
    console.log(chalk.red(`    Error: ${err.message}`));
    failed++;
    return Promise.resolve();
  }
}

async function runTests() {
  // ── Template Selection ─────────────────────────────────
  console.log(chalk.cyan("\n  Template Selection (per-model)"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Anthropic model gets Claude-specific prompt", () => {
    const prompt = buildSystemPrompt({
      modelId: "claude-sonnet-4-20250514",
      provider: "anthropic",
    });
    if (!prompt.includes("Anthropic's Claude models"))
      throw new Error("Should contain Anthropic-specific text");
    if (!prompt.includes("QuandCode"))
      throw new Error("Should contain QuandCode identity");
  });

  await test("OpenAI model gets GPT-specific prompt", () => {
    const prompt = buildSystemPrompt({
      modelId: "gpt-4o",
      provider: "openai",
    });
    if (!prompt.includes("OpenAI's GPT models"))
      throw new Error("Should contain OpenAI-specific text");
  });

  await test("Gemini model gets Gemini-specific prompt", () => {
    const prompt = buildSystemPrompt({
      modelId: "gemini-2.5-pro",
      provider: "google",
    });
    if (!prompt.includes("Gemini models"))
      throw new Error("Should contain Gemini-specific text");
  });

  await test("Unknown model gets default prompt", () => {
    const prompt = buildSystemPrompt({
      modelId: "some-custom-model",
      provider: "custom",
    });
    if (!prompt.includes("QuandCode"))
      throw new Error("Should contain QuandCode identity");
  });

  await test("o1 model maps to OpenAI template", () => {
    const prompt = buildSystemPrompt({
      modelId: "o1-preview",
      provider: "openai",
    });
    if (!prompt.includes("OpenAI's GPT models"))
      throw new Error("o1 should use OpenAI template");
  });

  // ── Model Identity Injection ───────────────────────────
  console.log(chalk.cyan("\n  Model Identity Injection"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Model ID is injected into prompt", () => {
    const prompt = buildSystemPrompt({
      modelId: "claude-sonnet-4-20250514",
      provider: "anthropic",
    });
    if (!prompt.includes("`claude-sonnet-4-20250514`"))
      throw new Error("Model ID not injected");
  });

  await test("Provider name is injected into prompt", () => {
    const prompt = buildSystemPrompt({
      modelId: "gpt-4o",
      provider: "openai",
    });
    if (!prompt.includes("`openai`"))
      throw new Error("Provider not injected");
  });

  // ── Agent Mode Context ─────────────────────────────────
  console.log(chalk.cyan("\n  Agent Mode Context"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Build mode includes full-access instructions", () => {
    const prompt = buildSystemPrompt({
      modelId: "claude-sonnet-4-20250514",
      provider: "anthropic",
      agentMode: "build",
    });
    if (!prompt.includes("BUILD"))
      throw new Error("Should mention BUILD mode");
    if (!prompt.includes("full access"))
      throw new Error("Should mention full access");
  });

  await test("Plan mode includes read-only restrictions", () => {
    const prompt = buildSystemPrompt({
      modelId: "claude-sonnet-4-20250514",
      provider: "anthropic",
      agentMode: "plan",
    });
    if (!prompt.includes("PLAN"))
      throw new Error("Should mention PLAN mode");
    if (!prompt.includes("Read-Only"))
      throw new Error("Should mention read-only");
    if (!prompt.includes("CANNOT"))
      throw new Error("Should list restrictions");
  });

  await test("Default agent mode is build", () => {
    const prompt = buildSystemPrompt({
      modelId: "gpt-4o",
      provider: "openai",
    });
    // When no agentMode specified, defaults to build context
    if (!prompt.includes("BUILD"))
      throw new Error("Default should be BUILD mode");
  });

  // ── Environment Info ───────────────────────────────────
  console.log(chalk.cyan("\n  Environment Detection"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Environment info is included", () => {
    const prompt = buildSystemPrompt({
      modelId: "gpt-4o",
      provider: "openai",
    });
    if (!prompt.includes("## Environment"))
      throw new Error("Should have environment section");
    if (!prompt.includes("OS"))
      throw new Error("Should include OS info");
    if (!prompt.includes("Working Directory"))
      throw new Error("Should include CWD");
  });

  // ── AGENTS.md Injection ────────────────────────────────
  console.log(chalk.cyan("\n  AGENTS.md Injection"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("AGENTS.md content is injected when provided", () => {
    const prompt = buildSystemPrompt({
      modelId: "claude-sonnet-4-20250514",
      provider: "anthropic",
      agentsMdOverride: "## My Project\n- Use TypeScript strict mode\n- Testing: Vitest",
    });
    if (!prompt.includes("Project Context"))
      throw new Error("Should have project context section");
    if (!prompt.includes("TypeScript strict mode"))
      throw new Error("AGENTS.md content not injected");
    if (!prompt.includes("Vitest"))
      throw new Error("AGENTS.md content incomplete");
  });

  await test("Prompt works without AGENTS.md", () => {
    const prompt = buildSystemPrompt({
      modelId: "gpt-4o",
      provider: "openai",
      cwd: "/nonexistent/path",
    });
    // Should not crash, just won't have the AGENTS.md section
    if (!prompt.includes("QuandCode"))
      throw new Error("Should still have core prompt");
  });

  // ── Custom Instructions ────────────────────────────────
  console.log(chalk.cyan("\n  Custom Instructions"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Custom instructions are appended", () => {
    const prompt = buildSystemPrompt({
      modelId: "gpt-4o",
      provider: "openai",
      customInstructions: "Always write tests using Vitest.\nPrefer functional programming.",
    });
    if (!prompt.includes("Custom Instructions"))
      throw new Error("Should have custom instructions section");
    if (!prompt.includes("Vitest"))
      throw new Error("Custom instructions not included");
  });

  // ── LSP Diagnostics ────────────────────────────────────
  console.log(chalk.cyan("\n  LSP Diagnostics"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Active diagnostics are included", () => {
    const prompt = buildSystemPrompt({
      modelId: "claude-sonnet-4-20250514",
      provider: "anthropic",
      diagnostics: "src/auth.ts:15:3 - error TS2339: Property 'userId' does not exist on type 'Request'",
    });
    if (!prompt.includes("Compiler Diagnostics"))
      throw new Error("Should have diagnostics section");
    if (!prompt.includes("TS2339"))
      throw new Error("Error code not included");
    if (!prompt.includes("userId"))
      throw new Error("Error details not included");
  });

  // ── Tool Descriptions ──────────────────────────────────
  console.log(chalk.cyan("\n  Tool Descriptions"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Tools are formatted in prompt", () => {
    const prompt = buildSystemPrompt({
      modelId: "gpt-4o",
      provider: "openai",
      tools: [
        { name: "file_read", description: "Read file contents", parameters: "{}" },
        { name: "bash", description: "Execute shell commands", parameters: "{}" },
      ],
    });
    if (!prompt.includes("Available Tools"))
      throw new Error("Should have tools section");
    if (!prompt.includes("file_read"))
      throw new Error("Tool name not included");
    if (!prompt.includes("bash"))
      throw new Error("Second tool not included");
  });

  // ── Utilities ──────────────────────────────────────────
  console.log(chalk.cyan("\n  Utilities"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Minimal prompt works", () => {
    const prompt = buildMinimalPrompt("claude-sonnet-4-20250514", "plan");
    if (!prompt.includes("PLAN"))
      throw new Error("Should include plan mode");
  });

  await test("Token estimation is reasonable", () => {
    const prompt = buildSystemPrompt({
      modelId: "gpt-4o",
      provider: "openai",
    });
    const tokens = estimatePromptTokens(prompt);
    if (tokens < 100) throw new Error(`Token estimate too low: ${tokens}`);
    if (tokens > 10000) throw new Error(`Token estimate too high: ${tokens}`);
  });

  // ── Full Prompt Assembly ───────────────────────────────
  console.log(chalk.cyan("\n  Full Prompt Assembly"));
  console.log(chalk.gray("  " + "─".repeat(38)));

  await test("Full prompt has all 8 sections", () => {
    const prompt = buildSystemPrompt({
      modelId: "claude-sonnet-4-20250514",
      provider: "anthropic",
      agentMode: "build",
      agentsMdOverride: "## Project\nUse TypeScript",
      customInstructions: "Write tests with Vitest",
      diagnostics: "error TS2339: missing property",
      tools: [
        { name: "read", description: "Read files", parameters: "{}" },
      ],
    });

    const checks = [
      ["Model template", "Anthropic's Claude"],
      ["Model identity", "`claude-sonnet-4-20250514`"],
      ["Agent mode", "BUILD"],
      ["Environment", "## Environment"],
      ["AGENTS.md", "Project Context"],
      ["Tools", "Available Tools"],
      ["Custom instructions", "Custom Instructions"],
      ["Diagnostics", "Compiler Diagnostics"],
    ];

    for (const [name, text] of checks) {
      if (!prompt.includes(text)) {
        throw new Error(`Missing section: ${name} (looking for "${text}")`);
      }
    }
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
