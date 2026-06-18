#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode TUI — Main Application
// ═══════════════════════════════════════════════════════════
//
// The interactive terminal interface for QuandCode.
// Wires together: CyberRenderer + InputHandler + Agent

import { Agent, getGlobalConfigPath } from "@quandcode/core";
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
      console.log(`  ${CYBER.neonCyan("1.")} Set API Key (Anthropic / OpenAI / Gemini)`);
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
        console.log();
        const provChoice = await this.input.askQuestion(CYBER.neonCyan("Enter choice (1-3) › "));
        
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
        console.log(`  ${CYBER.neonCyan("5.")} GPT-4o Mini (openai/gpt-4o-mini)`);
        console.log(`  ${CYBER.neonCyan("6.")} o3-mini (openai/o3-mini)`);
        console.log(`  ${CYBER.neonCyan("7.")} DeepSeek V3 (deepseek/deepseek-chat)`);
        console.log(`  ${CYBER.neonCyan("8.")} Custom Model ID`);
        console.log();

        const modelChoice = await this.input.askQuestion(CYBER.neonCyan("Select a model (1-8) › "));
        let modelId = "";
        if (modelChoice === "1") modelId = "gemini-2.5-flash";
        else if (modelChoice === "2") modelId = "gemini-2.5-pro";
        else if (modelChoice === "3") modelId = "claude-sonnet-4-20250514";
        else if (modelChoice === "4") modelId = "gpt-4o";
        else if (modelChoice === "5") modelId = "gpt-4o-mini";
        else if (modelChoice === "6") modelId = "o3-mini";
        else if (modelChoice === "7") modelId = "deepseek-chat";
        else if (modelChoice === "8") {
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
          this.config.provider = "anthropic";
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

        console.log(`│  ${CYBER.textDim("Anthropic Key:")}    ${anthropicSet ? CYBER.success("LOADED (process.env)") : CYBER.error("NOT CONFIGURED")}`);
        console.log(`│  ${CYBER.textDim("OpenAI Key:")}       ${openaiSet ? CYBER.success("LOADED (process.env)") : CYBER.error("NOT CONFIGURED")}`);
        console.log(`│  ${CYBER.textDim("Google Gemini Key:")} ${geminiSet ? CYBER.success("LOADED (process.env)") : CYBER.error("NOT CONFIGURED")}`);
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
