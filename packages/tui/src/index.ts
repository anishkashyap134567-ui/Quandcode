#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode TUI — Main Application
// ═══════════════════════════════════════════════════════════
//
// The interactive terminal interface for QuandCode.
// Wires together: CyberRenderer + InputHandler + Agent

import { Agent, getGlobalConfigPath, WorktreeManager } from "@quandcode/core";
import type { AgentResult } from "@quandcode/core";
import { CyberRenderer } from "./components/renderer.js";
import { InputHandler } from "./components/input.js";
import { StatusBar } from "./components/status_bar.js";
import { CYBER, BANNER, DIVIDER, formatAgentMode } from "./theme.js";
import * as fs from "node:fs";
import * as path from "node:path";
import chalk from "chalk";

// ── Configuration ─────────────────────────────────────────

interface TUIConfig {
  model: string;
  provider: string;
  mode: "build" | "plan";
  autoApprove: boolean;
  prompt?: string; // If set, run once and exit (non-interactive)
  resume?: string; // Explicit session ID to resume
  newSession?: boolean; // Force start a new session
}

// ── Main App ──────────────────────────────────────────────

export class QuandCodeTUI {
  private renderer: CyberRenderer;
  private input: InputHandler;
  private statusBar: StatusBar;
  private config: TUIConfig;
  private agent: Agent | null = null;
  private sessionId: string | null = null;
  private running = false;

  constructor(config: TUIConfig) {
    this.config = config;
    this.renderer = new CyberRenderer();
    this.input = new InputHandler();
    this.statusBar = new StatusBar();

    this.statusBar.update({
      mode: config.mode,
      model: config.model,
      provider: config.provider,
    });
  }

  /**
   * Start the TUI application.
   */
  async start(): Promise<void> {
    this.running = true;

    // Migrate local keys to global if local exists (to ensure keys are available across all folders)
    try {
      const localPath = path.join(process.cwd(), "quandcode.json");
      if (fs.existsSync(localPath)) {
        const localRaw = fs.readFileSync(localPath, "utf-8");
        const localJSON = JSON.parse(localRaw);
        if (localJSON.provider) {
          const globalPath = getGlobalConfigPath();
          let globalJSON: any = {};
          if (fs.existsSync(globalPath)) {
            try {
              const globalRaw = fs.readFileSync(globalPath, "utf-8");
              globalJSON = JSON.parse(globalRaw);
            } catch {}
          }

          let migrated = false;
          if (!globalJSON.provider) globalJSON.provider = {};
          for (const key of Object.keys(localJSON.provider)) {
            if (localJSON.provider[key]?.apiKey) {
              if (!globalJSON.provider[key]) globalJSON.provider[key] = {};
              if (globalJSON.provider[key].apiKey !== localJSON.provider[key].apiKey) {
                globalJSON.provider[key].apiKey = localJSON.provider[key].apiKey;
                migrated = true;
              }
            }
          }

          if (migrated) {
            const dir = path.dirname(globalPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(globalPath, JSON.stringify(globalJSON, null, 2), "utf-8");
          }
        }
      }
    } catch {}

    // Show banner
    this.renderer.showBanner();

    // Check for previous session to resume if we are not explicitly starting a new session
    if (!this.config.newSession) {
      const targetSessionId = this.config.resume;
      try {
        const { SessionManager } = await import("@quandcode/core");
        const sessionManager = new SessionManager(process.cwd());
        
        let sessionToResume = null;
        if (targetSessionId) {
          sessionToResume = await sessionManager.resumeSession(targetSessionId);
        } else {
          sessionToResume = await sessionManager.getLastSession();
        }

        if (sessionToResume) {
          this.sessionId = sessionToResume.id;
          this.config.mode = sessionToResume.activeAgent as any;
          this.config.model = sessionToResume.model;
          this.config.provider = sessionToResume.provider;
          this.statusBar.update({
            mode: this.config.mode,
            model: this.config.model,
            provider: this.config.provider,
          });
          const resumeType = targetSessionId ? "Resumed session:" : "Auto-resumed last active session:";
          console.log(
            `  ${CYBER.success("✔")} ${CYBER.textBright(resumeType)} ${CYBER.neonCyan(sessionToResume.id.slice(0, 8))}… (${CYBER.textDim(sessionToResume.title)})`
          );
          console.log();
        }
      } catch {}
    }

    // Show startup info
    console.log(
      `  ${CYBER.textDim("Model:")}    ${CYBER.neonCyan(this.config.provider + "/" + this.config.model)}`
    );
    console.log(
      `  ${CYBER.textDim("Mode:")}     ${formatAgentMode(this.config.mode)}`
    );
    console.log(
      `  ${CYBER.textDim("CWD:")}      ${CYBER.textDim(process.cwd())}`
    );
    console.log();
    console.log(
      `  ${CYBER.textDim("Type a prompt to begin, or")} ${CYBER.neonCyan("/help")} ${CYBER.textDim("for commands.")}`
    );

    // If we have a one-shot prompt, execute and exit
    if (this.config.prompt) {
      await this.executePrompt(this.config.prompt);
      this.shutdown();
      return;
    }

    // Enter the REPL loop
    await this.replLoop();
  }

  /**
   * The main REPL (Read-Eval-Print-Loop).
   */
  private async replLoop(): Promise<void> {
    while (this.running) {
      // Build the prompt string
      const promptStr = `${formatAgentMode(this.config.mode)} ${CYBER.dimCyan("›")} `;

      const command = await this.input.readLine(promptStr);

      switch (command.type) {
        case "quit":
          this.shutdown();
          return;

        case "command":
          await this.handleSlashCommand(command.value);
          break;

        case "prompt":
          if (command.value) {
            await this.executePrompt(command.value);
          }
          break;
      }
    }
  }

  /**
   * Execute a user prompt through the agent loop.
   */
  private async executePrompt(prompt: string): Promise<void> {
    // Show user message
    console.log();
    console.log(`${CYBER.dimCyan("┌")} ${CYBER.neonGreen("▸")} ${CYBER.textBright(prompt)}`);

    // Create agent with TUI event handlers
    const events = this.renderer.createEventHandlers();

    // Wrap onComplete to update status bar
    const originalOnComplete = events.onComplete;
    events.onComplete = (result: AgentResult) => {
      this.statusBar.update({
        inputTokens: result.totalTokens.input,
        outputTokens: result.totalTokens.output,
        toolCalls: result.toolCallCount,
        durationMs: result.durationMs,
      });
      originalOnComplete?.(result);
    };

    // Wrap onModeSwitch to update config
    const originalOnModeSwitch = events.onModeSwitch;
    events.onModeSwitch = (newMode: "build" | "plan") => {
      this.config.mode = newMode;
      this.statusBar.update({ mode: newMode });
      originalOnModeSwitch?.(newMode);
    };

    events.onPermissionRequest = async (toolName: string, description: string) => {
      const prompt = `\n${CYBER.warning("🛡️")} ${CYBER.neonYellow.bold("SECURITY GATE:")} ${CYBER.textBright(description)}\n  ${CYBER.neonYellow("Confirm (y/N) › ")}`;
      const answer = await this.input.askQuestion(prompt);
      const approved = answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "yes";
      return approved;
    };

    const agent = new Agent({
      model: this.config.model,
      provider: this.config.provider,
      mode: this.config.mode,
      autoApprove: this.config.autoApprove,
      cwd: process.cwd(),
      events,
    });

    try {
      const result = await agent.run(prompt, this.sessionId || undefined);
      this.sessionId = result.sessionId || this.sessionId;
    } catch (err) {
      console.log(
        `\n${CYBER.error("✖ Agent Error:")} ${CYBER.error((err as Error).message)}`
      );
    }
  }

  /**
   * Handle a slash command.
   */
  private async handleSlashCommand(input: string): Promise<void> {
    const action = this.input.handleCommand(input);

    switch (action) {
      case "plan":
        this.config.mode = "plan";
        this.statusBar.update({ mode: "plan" });
        console.log(`\nSwitched to ${formatAgentMode("plan")} mode\n`);
        break;

      case "build":
        this.config.mode = "build";
        this.statusBar.update({ mode: "build" });
        console.log(`\nSwitched to ${formatAgentMode("build")} mode\n`);
        break;

      case "session":
        console.log(`\n  ${CYBER.textDim("Session:")} ${CYBER.neonCyan(this.sessionId || "None")}`);
        this.statusBar.print();
        console.log();
        break;

      case "models":
        console.log(`\n  ${CYBER.textDim("Current model:")} ${CYBER.neonCyan(this.config.provider + "/" + this.config.model)}`);
        console.log(`  ${CYBER.textDim("To change, set in quandcode.json or use --model flag.")}`);
        console.log();
        break;

      case "compact":
        console.log(`\n  ${CYBER.neonYellow("⚙")} Compact mode toggled.\n`);
        break;

      case "config":
        await this.runConfigWizard();
        break;

      case "sessions": {
        try {
          const { SessionManager } = await import("@quandcode/core");
          const sessionManager = new SessionManager(process.cwd());
          const sessions = await sessionManager.listSessions();
          
          console.log();
          console.log(CYBER.neonCyan("┌── Previous Sessions ──────────────────────────────"));
          if (sessions.length === 0) {
            console.log(`│  ${CYBER.textDim("No saved sessions found.")}`);
          } else {
            for (const s of sessions) {
              const activeMark = s.id === this.sessionId ? CYBER.neonGreen(" ● (active)") : "";
              console.log(`│  ${CYBER.neonCyan(s.id.slice(0, 8))}… : ${CYBER.textBright(s.title)}${activeMark}`);
              console.log(`│    ${CYBER.textDim("Model:")} ${s.provider}/${s.model} | ${CYBER.textDim("Updated:")} ${new Date(s.updatedAt).toLocaleString()}`);
            }
            console.log(`│`);
            console.log(`│  Type ${CYBER.neonCyan("/switch <id>")} to load a session.`);
          }
          console.log(CYBER.neonCyan("└───────────────────────────────────────────────────"));
          console.log();
        } catch (err) {
          console.log(`\n${CYBER.error("✖ Failed to list sessions:")} ${(err as Error).message}\n`);
        }
        break;
      }

      case "switch": {
        const parts = input.trim().split(" ");
        const targetIdSpec = parts[1];
        if (!targetIdSpec) {
          console.log(`\n${CYBER.error("✖ Please specify a session ID to switch to.")}\n`);
          break;
        }

        try {
          const { SessionManager } = await import("@quandcode/core");
          const sessionManager = new SessionManager(process.cwd());
          
          // Find the actual session ID. User might type the prefix (e.g. first 8 chars)
          const sessions = await sessionManager.listSessions();
          const found = sessions.find(s => s.id === targetIdSpec || s.id.startsWith(targetIdSpec));
          
          if (!found) {
            console.log(`\n${CYBER.error(`✖ Session not found matching "${targetIdSpec}".`)}\n`);
            break;
          }

          this.sessionId = found.id;
          this.config.mode = found.activeAgent as any;
          this.config.model = found.model;
          this.config.provider = found.provider;
          
          this.statusBar.update({
            mode: this.config.mode,
            model: this.config.model,
            provider: this.config.provider,
          });

          console.log(`\n${CYBER.success("✔")} Switched to session: ${CYBER.neonCyan(found.id)} (${CYBER.textDim(found.title)})\n`);
        } catch (err) {
          console.log(`\n${CYBER.error("✖ Failed to switch session:")} ${(err as Error).message}\n`);
        }
        break;
      }

      case "new": {
        this.sessionId = null;
        console.log(`\n${CYBER.success("✔")} Started a new session. Next prompt will create a fresh context.\n`);
        break;
      }

      case "parallel": {
        const parts = input.trim().split(" ");
        parts.shift(); // Remove the command "/parallel"
        const prompt = parts.join(" ").trim();
        if (!prompt) {
          console.log(`\n${CYBER.error("✖ Please specify a task description, e.g., /parallel 'Fix index.ts typos'")}\n`);
          break;
        }

        try {
          console.log(`\n${CYBER.success("⚙")} Starting parallel subagent task inside a new Git worktree...`);
          const job = await WorktreeManager.create(prompt, this.config.model, this.config.provider);
          console.log(`\n  ${CYBER.success("✔")} Subagent started!`);
          console.log(`  ${CYBER.textDim("Task ID:")} ${CYBER.neonCyan(job.id)}`);
          console.log(`  ${CYBER.textDim("Log File:")} ${CYBER.textDim(job.logFile)}`);
          console.log(`  To check progress, view the logs or type: ${CYBER.neonCyan("/worktrees")}\n`);
        } catch (err) {
          console.log(`\n${CYBER.error("✖ Failed to spawn parallel worktree:")} ${(err as Error).message}\n`);
        }
        break;
      }

      case "worktrees": {
        const jobs = WorktreeManager.list();
        console.log();
        console.log(CYBER.neonCyan("┌── Active Parallel Worktree Subagents ─────────────────"));
        if (jobs.length === 0) {
          console.log(`│  ${CYBER.textDim("No active parallel subagents found.")}`);
        } else {
          for (const job of jobs) {
            const statusColor = job.status === "running" ? CYBER.neonYellow : job.status === "completed" ? CYBER.neonGreen : CYBER.neonRed;
            console.log(`│  ${CYBER.neonCyan(job.id)} : ${CYBER.textBright(job.task)}`);
            console.log(`│    ${CYBER.textDim("Status:")} ${statusColor(job.status)} | ${CYBER.textDim("Branch:")} ${job.branch}`);
            console.log(`│    ${CYBER.textDim("Path:")}   ${job.path}`);
            console.log(`│    ${CYBER.textDim("Logs:")}   ${job.logFile}`);
          }
          console.log(`│`);
          console.log(`│  To clean up a finished job: ${CYBER.neonCyan("/wcleanup <id>")}`);
        }
        console.log(CYBER.neonCyan("└───────────────────────────────────────────────────────"));
        console.log();
        break;
      }

      case "wcleanup": {
        const parts = input.trim().split(" ");
        const targetId = parts[1];
        if (!targetId) {
          console.log(`\n${CYBER.error("✖ Please specify a worktree job ID to clean up.")}\n`);
          break;
        }

        try {
          const job = WorktreeManager.get(targetId);
          if (!job) {
            console.log(`\n${CYBER.error(`✖ Worktree job "${targetId}" not found.`)}\n`);
            break;
          }

          if (job.status === "running") {
            console.log(`\n${CYBER.error("✖ Cannot clean up a running subagent job.")}\n`);
            break;
          }

          WorktreeManager.cleanup(targetId);
          console.log(`\n${CYBER.success("✔")} Successfully removed worktree and branch for job: ${CYBER.neonCyan(targetId)}\n`);
        } catch (err) {
          console.log(`\n${CYBER.error("✖ Failed to clean up worktree:")} ${(err as Error).message}\n`);
        }
        break;
      }
    }
  }

  private getConfigPath(): string {
    const localPath = path.join(process.cwd(), "quandcode.json");
    if (fs.existsSync(localPath)) {
      return localPath;
    }
    const globalPath = getGlobalConfigPath();
    const dir = path.dirname(globalPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return globalPath;
  }

  private saveConfig(config: any): void {
    const configPath = this.getConfigPath();
    try {
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");
    } catch (err) {
      console.log(`${CYBER.error("✖ Failed to save configuration:")} ${(err as Error).message}`);
    }
  }

  private loadConfig(): any {
    const configPath = this.getConfigPath();
    if (fs.existsSync(configPath)) {
      try {
        const raw = fs.readFileSync(configPath, "utf-8");
        return JSON.parse(raw);
      } catch {
        return {};
      }
    }
    return {};
  }

  private async runConfigWizard(): Promise<void> {
    console.log();
    console.log(CYBER.neonCyan("╔══════════════════════════════════════════════════════════╗"));
    console.log(CYBER.neonCyan("║") + "             " + chalk.bold.white("⚡ QUANDCODE CONFIG WIZARD ⚡") + "                " + CYBER.neonCyan("║"));
    console.log(CYBER.neonCyan("╚══════════════════════════════════════════════════════════╝"));
    console.log();

    let inWizard = true;
    while (inWizard) {
      console.log(CYBER.textBright("Select an option:"));
      console.log(`  ${CYBER.neonCyan("1.")} Set API Key / Base URL (Anthropic / OpenAI / Gemini / Ollama)`);
      console.log(`  ${CYBER.neonCyan("2.")} Set Default Model`);
      console.log(`  ${CYBER.neonCyan("3.")} View Active Config`);
      console.log(`  ${CYBER.neonCyan("4.")} Exit Wizard`);
      console.log();

      const choice = await this.input.askQuestion(CYBER.neonCyan("Enter choice (1-4) › "));
      if (choice === "1") {
        console.log();
        console.log(CYBER.textBright("Select Provider:"));
        console.log(`  ${CYBER.neonCyan("1.")} Anthropic`);
        console.log(`  ${CYBER.neonCyan("2.")} OpenAI`);
        console.log(`  ${CYBER.neonCyan("3.")} Google Gemini`);
        console.log(`  ${CYBER.neonCyan("4.")} Ollama (Local)`);
        console.log();
        const provChoice = await this.input.askQuestion(CYBER.neonCyan("Enter choice (1-4) › "));
        
        if (provChoice === "4") {
          let baseUrl = await this.input.askQuestion(CYBER.neonCyan("Enter Ollama Base URL [default: http://127.0.0.1:11434] › "));
          if (!baseUrl.trim()) baseUrl = "http://127.0.0.1:11434";

          const currentConfig = this.loadConfig();
          if (!currentConfig.provider) currentConfig.provider = {};
          if (!currentConfig.provider.ollama) currentConfig.provider.ollama = {};
          currentConfig.provider.ollama.baseURL = baseUrl;
          this.saveConfig(currentConfig);

          console.log(`\n${CYBER.success("✔")} Ollama Base URL saved to ${CYBER.textBright("quandcode.json")}!\n`);
          continue;
        }

        let providerName = "";
        let envVar = "";
        if (provChoice === "1") { providerName = "anthropic"; envVar = "ANTHROPIC_API_KEY"; }
        else if (provChoice === "2") { providerName = "openai"; envVar = "OPENAI_API_KEY"; }
        else if (provChoice === "3") { providerName = "google"; envVar = "GEMINI_API_KEY"; }

        if (!providerName) {
          console.log(`\n${CYBER.error("✖ Invalid choice. Returning to main menu.")}\n`);
          continue;
        }

        const apiKey = await this.input.askQuestion(CYBER.neonCyan(`Enter API Key for ${providerName} › `));
        if (!apiKey) {
          console.log(`\n${CYBER.error("✖ Key cannot be empty. Returning to main menu.")}\n`);
          continue;
        }

        // Apply in memory
        process.env[envVar] = apiKey;
        if (providerName === "google") {
          process.env.GOOGLE_API_KEY = apiKey;
        }

        // Persist on disk
        const currentConfig = this.loadConfig();
        if (!currentConfig.provider) currentConfig.provider = {};
        if (!currentConfig.provider[providerName]) currentConfig.provider[providerName] = {};
        currentConfig.provider[providerName].apiKey = apiKey;
        this.saveConfig(currentConfig);

        console.log(`\n${CYBER.success("✔")} API Key for ${CYBER.neonCyan(providerName)} saved to ${CYBER.textBright("quandcode.json")} and loaded!\n`);

      } else if (choice === "2") {
        console.log();
        console.log(CYBER.textBright("Recommended Models:"));
        console.log(`  ${CYBER.neonCyan("1.")} Gemini 2.5 Flash (google/gemini-2.5-flash)`);
        console.log(`  ${CYBER.neonCyan("2.")} Gemini 2.5 Pro (google/gemini-2.5-pro)`);
        console.log(`  ${CYBER.neonCyan("3.")} Claude Sonnet 4 (anthropic/claude-sonnet-4-20250514)`);
        console.log(`  ${CYBER.neonCyan("4.")} GPT-4o (openai/gpt-4o)`);
        console.log(`  ${CYBER.neonCyan("5.")} Llama 3.1 Local (ollama/llama3.1)`);
        console.log(`  ${CYBER.neonCyan("6.")} Qwen 2.5 Coder Local (ollama/qwen2.5-coder)`);
        console.log(`  ${CYBER.neonCyan("7.")} Custom Model ID`);
        console.log();

        const modelChoice = await this.input.askQuestion(CYBER.neonCyan("Select a model (1-7) › "));
        let modelId = "";
        if (modelChoice === "1") modelId = "gemini-2.5-flash";
        else if (modelChoice === "2") modelId = "gemini-2.5-pro";
        else if (modelChoice === "3") modelId = "claude-sonnet-4-20250514";
        else if (modelChoice === "4") modelId = "gpt-4o";
        else if (modelChoice === "5") modelId = "llama3.1";
        else if (modelChoice === "6") modelId = "qwen2.5-coder";
        else if (modelChoice === "7") {
          modelId = await this.input.askQuestion(CYBER.neonCyan("Enter custom model ID › "));
        }

        if (!modelId) {
          console.log(`\n${CYBER.error("✖ Model ID cannot be empty.")}\n`);
          continue;
        }

        // Apply in memory
        this.config.model = modelId;
        const { getProviderRegistry } = await import("@quandcode/core");
        const registry = getProviderRegistry();
        const resolved = registry.resolveModel(modelId);
        if (resolved) {
          this.config.provider = resolved.provider.name;
        } else {
          // Default fallback
          this.config.provider = modelId.startsWith("ollama/") || modelChoice === "5" || modelChoice === "6" ? "ollama" : "anthropic";
        }

        // Persist on disk
        const currentConfig = this.loadConfig();
        currentConfig.model = modelId;
        this.saveConfig(currentConfig);

        console.log(`\n${CYBER.success("✔")} Default model set to ${CYBER.neonGreen(modelId)} (provider: ${CYBER.neonCyan(this.config.provider)})!\n`);

      } else if (choice === "3") {
        console.log();
        console.log(CYBER.neonCyan("┌── Active Configuration ─────────────────"));
        console.log(`│  ${CYBER.textDim("Default Model:")}    ${CYBER.neonGreen(this.config.provider + "/" + this.config.model)}`);
        
        const anthropicSet = !!process.env.ANTHROPIC_API_KEY;
        const openaiSet = !!process.env.OPENAI_API_KEY;
        const geminiSet = !!process.env.GEMINI_API_KEY || !!process.env.GOOGLE_API_KEY;

        const currentConfig = this.loadConfig();
        const ollamaBaseUrl = currentConfig.provider?.ollama?.baseURL || "http://127.0.0.1:11434 (default)";

        console.log(`│  ${CYBER.textDim("Anthropic Key:")}    ${anthropicSet ? CYBER.success("LOADED (process.env)") : CYBER.error("NOT CONFIGURED")}`);
        console.log(`│  ${CYBER.textDim("OpenAI Key:")}       ${openaiSet ? CYBER.success("LOADED (process.env)") : CYBER.error("NOT CONFIGURED")}`);
        console.log(`│  ${CYBER.textDim("Google Gemini Key:")} ${geminiSet ? CYBER.success("LOADED (process.env)") : CYBER.error("NOT CONFIGURED")}`);
        console.log(`│  ${CYBER.textDim("Ollama Base URL:")}  ${CYBER.neonCyan(ollamaBaseUrl)}`);
        console.log(CYBER.neonCyan("└─────────────────────────────────────────"));
        console.log();

      } else if (choice === "4") {
        inWizard = false;
        console.log(`\n${CYBER.neonYellow("⚙")} Exited configuration wizard. Ready.\n`);
      } else {
        console.log(`\n${CYBER.error("✖ Invalid choice. Please select 1-4.")}\n`);
      }
    }
  }

  /**
   * Graceful shutdown.
   */
  shutdown(): void {
    this.running = false;
    this.input.close();
    console.log();
    console.log(
      `${CYBER.dimCyan("╰")} ${CYBER.neonMagenta("⚡")} ${CYBER.textDim("QuandCode terminated. See you, space cowboy.")} ${CYBER.neonMagenta("⚡")}`
    );
    console.log();
  }
}

// ── Export for CLI integration ────────────────────────────

export { CyberRenderer } from "./components/renderer.js";
export { InputHandler } from "./components/input.js";
export { StatusBar } from "./components/status_bar.js";
export * from "./theme.js";
