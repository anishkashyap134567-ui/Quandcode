// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — System Prompt Builder
// ═══════════════════════════════════════════════════════════
//
// Dynamically assembles the system prompt from 8 fragments:
//  1. Static identity header
//  2. Model-specific behavioral instructions (.txt templates)
//  3. Available tools description (auto-generated)
//  4. Project context (AGENTS.md)
//  5. Environment info (OS, CWD, git, runtimes)
//  6. Model identity injection
//  7. Custom user instructions (from config)
//  8. Active LSP diagnostics (if any)
//
// Different LLM providers respond differently to prompting
// styles. This module selects the optimal template per model.

import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ── Prompt Template Cache ─────────────────────────────────

const templateCache = new Map<string, string>();
const PROMPTS_DIR = path.join(
  import.meta.dir || path.dirname(new URL(import.meta.url).pathname),
  "prompts"
);

/**
 * Load a prompt template from disk, with caching.
 */
function loadTemplate(filename: string): string {
  if (templateCache.has(filename)) {
    return templateCache.get(filename)!;
  }

  const templatePath = path.join(PROMPTS_DIR, filename);
  try {
    const content = fs.readFileSync(templatePath, "utf-8");
    templateCache.set(filename, content);
    return content;
  } catch {
    // Fallback to default template
    const defaultPath = path.join(PROMPTS_DIR, "default.txt");
    try {
      const content = fs.readFileSync(defaultPath, "utf-8");
      templateCache.set(filename, content);
      return content;
    } catch {
      return "You are QuandCode, an AI coding agent.";
    }
  }
}

// ── Model → Template Mapping ──────────────────────────────

/**
 * Select the appropriate prompt template based on model ID.
 * Each provider's models respond best to a specific prompting style.
 */
function selectTemplate(modelId: string): string {
  const id = modelId.toLowerCase();

  // Anthropic (Claude) models
  if (
    id.includes("claude") ||
    id.includes("anthropic")
  ) {
    return loadTemplate("anthropic.txt");
  }

  // OpenAI models
  if (
    id.includes("gpt") ||
    id.includes("o1") ||
    id.includes("o3") ||
    id.includes("chatgpt") ||
    id.includes("codex")
  ) {
    return loadTemplate("openai.txt");
  }

  // Google Gemini models
  if (
    id.includes("gemini") ||
    id.includes("google")
  ) {
    return loadTemplate("gemini.txt");
  }

  // Default for all other models
  return loadTemplate("default.txt");
}

// ── Environment Detection ─────────────────────────────────

interface EnvironmentInfo {
  os: string;
  arch: string;
  cwd: string;
  shell: string;
  nodeVersion: string;
  bunVersion: string | null;
  gitBranch: string | null;
  gitStatus: string | null;
  homeDir: string;
  username: string;
}

/**
 * Detect the current environment.
 */
function detectEnvironment(cwd?: string): EnvironmentInfo {
  const workDir = cwd || process.cwd();

  // Detect git branch
  let gitBranch: string | null = null;
  let gitStatus: string | null = null;
  try {
    const headPath = path.join(workDir, ".git", "HEAD");
    if (fs.existsSync(headPath)) {
      const head = fs.readFileSync(headPath, "utf-8").trim();
      if (head.startsWith("ref: refs/heads/")) {
        gitBranch = head.replace("ref: refs/heads/", "");
      } else {
        gitBranch = head.substring(0, 8) + " (detached)";
      }
    }
  } catch {
    // Not a git repo
  }

  // Detect Bun version
  let bunVersion: string | null = null;
  try {
    bunVersion = (globalThis as any).Bun?.version || null;
  } catch {
    // Not running in Bun
  }

  return {
    os: `${os.type()} ${os.release()} (${os.platform()})`,
    arch: os.arch(),
    cwd: workDir,
    shell: process.env.SHELL || process.env.COMSPEC || "unknown",
    nodeVersion: process.version,
    bunVersion,
    gitBranch,
    gitStatus,
    homeDir: os.homedir(),
    username: os.userInfo().username,
  };
}

// ── AGENTS.md Reader ──────────────────────────────────────

/**
 * Read and return the contents of AGENTS.md if it exists.
 * Searches CWD and parent directories.
 */
function readAgentsMd(cwd?: string): string | null {
  let dir = cwd || process.cwd();

  // Search up to 5 levels up
  for (let i = 0; i < 5; i++) {
    const agentsPath = path.join(dir, "AGENTS.md");
    if (fs.existsSync(agentsPath)) {
      try {
        return fs.readFileSync(agentsPath, "utf-8");
      } catch {
        return null;
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return null;
}

// ── Tool Description Generator ────────────────────────────

export interface ToolDescription {
  name: string;
  description: string;
  parameters: string; // JSON Schema as string
}

/**
 * Format tool descriptions for the system prompt.
 */
function formatToolDescriptions(tools: ToolDescription[]): string {
  if (tools.length === 0) return "";

  const lines = ["## Available Tools", ""];
  for (const tool of tools) {
    lines.push(`### ${tool.name}`);
    lines.push(tool.description);
    lines.push("");
  }

  return lines.join("\n");
}

// ── Main System Prompt Builder ────────────────────────────

export interface SystemPromptOptions {
  /** The model being used (determines which template to select) */
  modelId: string;

  /** Provider name */
  provider: string;

  /** Working directory */
  cwd?: string;

  /** Available tools (auto-formatted into prompt) */
  tools?: ToolDescription[];

  /** Active agent mode: "build" or "plan" */
  agentMode?: "build" | "plan";

  /** Custom instructions from user config */
  customInstructions?: string;

  /** Active LSP diagnostics (errors/warnings) */
  diagnostics?: string;

  /** Override AGENTS.md content (for testing) */
  agentsMdOverride?: string;
}

/**
 * Build the complete system prompt.
 *
 * Assembles 8 fragments in order:
 * 1. Model-specific behavioral template
 * 2. Model identity injection
 * 3. Agent mode context (Build vs Plan)
 * 4. Environment info
 * 5. Project context (AGENTS.md)
 * 6. Tool descriptions
 * 7. Custom user instructions
 * 8. Active diagnostics
 */
export function buildSystemPrompt(options: SystemPromptOptions): string {
  const sections: string[] = [];

  // ── 1. Model-Specific Template ──────────────────────────
  const template = selectTemplate(options.modelId);
  sections.push(template);

  // ── 2. Model Identity Injection ─────────────────────────
  sections.push(
    `\n## Model Information\n` +
    `You are powered by the model: \`${options.modelId}\`\n` +
    `Provider: \`${options.provider}\`\n` +
    `Do not hallucinate your capabilities — use the tools provided.`
  );

  // ── 3. Agent Mode Context ───────────────────────────────
  if (options.agentMode === "plan") {
    sections.push(
      `\n## Agent Mode: PLAN (Read-Only Architect)\n` +
      `You are in **Plan Mode**. Your role is to ANALYZE and PLAN, not to implement.\n\n` +
      `### Plan Mode Rules\n` +
      `- ✅ You CAN: read files, search code, list directories, ask questions\n` +
      `- ❌ You CANNOT: write files, edit files, or run destructive commands\n` +
      `- ❌ You CANNOT: use the \`write\` or \`edit\` tools\n` +
      `- ⚠️ Bash commands require explicit user permission\n\n` +
      `### Your Job in Plan Mode\n` +
      `1. Explore and understand the codebase\n` +
      `2. Identify all files that need to change\n` +
      `3. Determine the correct order of changes\n` +
      `4. Create a detailed, actionable implementation plan\n` +
      `5. Include a verification strategy (tests, builds, manual checks)\n\n` +
      `When your plan is complete, present it to the user for approval. ` +
      `They will then switch to Build mode to execute it.`
    );
  } else {
    sections.push(
      `\n## Agent Mode: BUILD (Full-Access Engineer)\n` +
      `You are in **Build Mode**. You have full access to all tools.\n` +
      `You can read, write, edit files, and run shell commands.\n\n` +
      `### Build Mode Workflow\n` +
      `1. **Understand** — Read relevant files and understand the context\n` +
      `2. **Plan** — Briefly outline your approach (in your response)\n` +
      `3. **Implement** — Make changes using the appropriate tools\n` +
      `4. **Verify** — Check for errors (LSP diagnostics, tests, builds)\n` +
      `5. **Fix** — If errors found, fix them and re-verify\n` +
      `6. **Report** — Summarize what you changed and why`
    );
  }

  // ── 4. Environment Info ─────────────────────────────────
  const env = detectEnvironment(options.cwd);
  sections.push(
    `\n## Environment\n` +
    `- **OS**: ${env.os}\n` +
    `- **Architecture**: ${env.arch}\n` +
    `- **Working Directory**: \`${env.cwd}\`\n` +
    `- **Shell**: \`${env.shell}\`\n` +
    (env.bunVersion ? `- **Bun**: v${env.bunVersion}\n` : "") +
    `- **Node.js**: ${env.nodeVersion}\n` +
    (env.gitBranch ? `- **Git Branch**: \`${env.gitBranch}\`\n` : "- **Git**: Not a git repository\n") +
    `- **User**: ${env.username}`
  );

  // ── 5. Project Context (AGENTS.md) ──────────────────────
  const agentsMd =
    options.agentsMdOverride || readAgentsMd(options.cwd);

  if (agentsMd) {
    sections.push(
      `\n## Project Context (from AGENTS.md)\n` +
      `The following describes this project's conventions, architecture, and rules.\n` +
      `**Follow these instructions carefully.**\n\n` +
      agentsMd
    );
  }

  // ── 6. Tool Descriptions ────────────────────────────────
  if (options.tools && options.tools.length > 0) {
    sections.push("\n" + formatToolDescriptions(options.tools));
  }

  // ── 7. Custom User Instructions ─────────────────────────
  if (options.customInstructions) {
    sections.push(
      `\n## Custom Instructions (from user config)\n` +
      options.customInstructions
    );
  }

  // ── 8. Active Diagnostics ───────────────────────────────
  if (options.diagnostics) {
    sections.push(
      `\n## Active Compiler Diagnostics\n` +
      `The following errors/warnings were detected by the language server.\n` +
      `Address these issues in your next response.\n\n` +
      `\`\`\`\n${options.diagnostics}\n\`\`\``
    );
  }

  return sections.join("\n\n");
}

/**
 * Build a minimal system prompt (for token-constrained situations).
 */
export function buildMinimalPrompt(modelId: string, agentMode: "build" | "plan" = "build"): string {
  return buildSystemPrompt({
    modelId,
    provider: "unknown",
    agentMode,
  });
}

// ── Prompt Statistics ─────────────────────────────────────

/**
 * Estimate token count for a system prompt.
 * Uses rough approximation: 1 token ≈ 4 characters.
 */
export function estimatePromptTokens(prompt: string): number {
  return Math.ceil(prompt.length / 4);
}
