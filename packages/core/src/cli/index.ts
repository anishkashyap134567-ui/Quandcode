#!/usr/bin/env bun
import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import chalk from 'chalk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { VERSION, NAME } from '../index.js';

// ─── Cyberpunk Banner ────────────────────────────────────────────────
function printBanner(): void {
  const banner = `
${chalk.cyan('╔═══════════════════════════════════════════╗')}
${chalk.cyan('║')}           ${chalk.bold.yellowBright('⚡ Q U A N D C O D E ⚡')}          ${chalk.cyan('║')}
${chalk.cyan('║')}         ${chalk.white('The AI Coding Agent')} ${chalk.gray(`v${VERSION}`)}        ${chalk.cyan('║')}
${chalk.cyan('║')}      ${chalk.magenta('TypeScript + Rust')} ${chalk.gray('·')} ${chalk.magenta('75+ Providers')}    ${chalk.cyan('║')}
${chalk.cyan('╚═══════════════════════════════════════════╝')}`;
  console.log(banner);
  console.log();
  console.log(
    chalk.gray('  Type ') +
    chalk.cyan("'quandcode run -p <prompt>'") +
    chalk.gray(' to start')
  );
  console.log();
}

// ─── AGENTS.md Template ──────────────────────────────────────────────
const AGENTS_MD_TEMPLATE = `# QuandCode Project Configuration

## Overview
This file configures QuandCode's behavior for this project.

## Instructions
- Describe your project architecture and conventions here
- QuandCode will read this file to understand your project

## Code Style
- Follow existing patterns in the codebase
- Use TypeScript strict mode

## Testing
- Write tests for all new functionality
- Run tests before committing
`;

// ─── CLI Setup ───────────────────────────────────────────────────────
async function main(): Promise<void> {
  const cli = yargs(hideBin(process.argv))
    .scriptName('quandcode')
    .usage(chalk.cyan('Usage: $0 <command> [options]'))
    .version(VERSION)
    .alias('v', 'version')
    .help('h')
    .alias('h', 'help')
    .wrap(Math.min(100, process.stdout.columns || 80))
    .epilogue(
      chalk.gray('─'.repeat(45)) +
      '\n' +
      chalk.cyan(`  ${NAME} v${VERSION}`) +
      chalk.gray(' — The AI Coding Agent') +
      '\n' +
      chalk.gray('  https://github.com/your-org/quandcode')
    )

    // ── run command ──────────────────────────────────────────────
    .command(
      'run [message..]',
      chalk.white('Start a coding session with the AI agent'),
      (yargs) => {
        return yargs
          .positional('message', {
            describe: 'The prompt message to send to the agent',
            type: 'string',
            array: true,
          })
          .option('prompt', {
            alias: 'p',
            type: 'string',
            describe: 'Prompt to send to the agent',
          })
          .option('model', {
            alias: 'm',
            type: 'string',
            describe: 'Model to use (e.g. claude-sonnet-4-20250514, gpt-4o)',
          })
          .option('provider', {
            type: 'string',
            describe: 'Provider to use (e.g. anthropic, openai)',
          })
          .option('resume', {
            alias: 'r',
            type: 'string',
            describe: 'Resume a previous session by ID',
          })
          .option('plan', {
            type: 'boolean',
            describe: 'Use Plan agent for architecture reasoning',
            default: false,
          })
          .example('$0 run -p "Fix the login bug"', 'Start with a prompt')
          .example('$0 run Fix the login bug', 'Positional prompt')
          .example('$0 run -p "Add tests" --model gpt-4o', 'Specify model');
      },
      (async (argv) => {
        const { discoverConfig } = await import('../config/index.js');
        const config = discoverConfig();

        const prompt = argv.prompt || (argv.message as string[] | undefined)?.join(' ');
        const mode = argv.plan ? 'plan' as const : 'build' as const;
        
        let defaultModel = config.model;
        if (!defaultModel) {
          if (config.provider?.google?.apiKey) {
            defaultModel = 'gemini-2.5-flash';
          } else if (config.provider?.anthropic?.apiKey) {
            defaultModel = 'claude-sonnet-4-20250514';
          } else if (config.provider?.openai?.apiKey) {
            defaultModel = 'gpt-4o';
          } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
            defaultModel = 'gemini-2.5-flash';
          } else if (process.env.ANTHROPIC_API_KEY) {
            defaultModel = 'claude-sonnet-4-20250514';
          } else if (process.env.OPENAI_API_KEY) {
            defaultModel = 'gpt-4o';
          } else {
            defaultModel = 'claude-sonnet-4-20250514';
          }
        }
        const model = (argv.model as string) || defaultModel;

        const { getProviderRegistry } = await import('../provider/index.js');
        const registry = getProviderRegistry();
        if (config.provider) {
          for (const [name, provConfig] of Object.entries(config.provider)) {
            registry.setProviderConfig(name, provConfig as any);
          }
        }
        let resolved = registry.resolveModel(model);
        if (!resolved) {
          let fallbackModel = 'claude-sonnet-4-20250514';
          if (config.provider?.google?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
            fallbackModel = 'gemini-2.5-flash';
          } else if (config.provider?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY) {
            fallbackModel = 'claude-sonnet-4-20250514';
          } else if (config.provider?.openai?.apiKey || process.env.OPENAI_API_KEY) {
            fallbackModel = 'gpt-4o';
          }
          resolved = registry.resolveModel(fallbackModel);
        }
        const finalModel = resolved?.model.id || model;
        const provider = (argv.provider as string) || resolved?.provider.name || 'anthropic';

        // Launch the TUI
        const { QuandCodeTUI } = await import('../../../tui/src/index.js');
        
        const tui = new QuandCodeTUI({
          model: finalModel,
          provider,
          mode,
          autoApprove: false,
          prompt: prompt || undefined,
        });

        await tui.start();
      })
    )

    // ── init command ─────────────────────────────────────────────
    .command(
      'init',
      chalk.white('Initialize QuandCode in the current directory'),
      (yargs) => {
        return yargs.option('force', {
          alias: 'f',
          type: 'boolean',
          describe: 'Overwrite existing configuration',
          default: false,
        });
      },
      (argv) => {
        printBanner();
        const cwd = process.cwd();
        const quandcodeDir = path.join(cwd, '.quandcode');
        const agentsFile = path.join(cwd, 'AGENTS.md');

        // Create .quandcode directory
        if (!fs.existsSync(quandcodeDir)) {
          fs.mkdirSync(quandcodeDir, { recursive: true });
          console.log(
            chalk.green('✔ Created ') + chalk.white('.quandcode/') + chalk.green(' directory')
          );
        } else {
          console.log(
            chalk.gray('  .quandcode/ directory already exists')
          );
        }

        // Create AGENTS.md
        if (!fs.existsSync(agentsFile) || argv.force) {
          fs.writeFileSync(agentsFile, AGENTS_MD_TEMPLATE, 'utf-8');
          console.log(
            chalk.green('✔ Created ') + chalk.white('AGENTS.md')
          );
        } else {
          console.log(
            chalk.gray('  AGENTS.md already exists (use --force to overwrite)')
          );
        }

        console.log();
        console.log(
          chalk.green('⚡ Initialized QuandCode in current directory')
        );
        console.log(
          chalk.gray('  Edit AGENTS.md to configure project-specific behavior.')
        );
        console.log();
      }
    )

    // ── models command ───────────────────────────────────────────
    .command(
      'models',
      chalk.white('List available LLM models and providers'),
      (yargs) => {
        return yargs.option('provider', {
          type: 'string',
          describe: 'Filter by provider name',
        });
      },
      (argv) => {
        printBanner();
        console.log(chalk.cyan('📋 Available Models'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log();
        console.log(
          chalk.yellow('⏳ Provider system not implemented yet (Phase 4)')
        );
        console.log(
          chalk.gray(
            '  75+ providers will be available via the unified provider abstraction.'
          )
        );
        console.log();
        console.log(chalk.gray('  Planned providers:'));
        const providers = [
          'Anthropic (Claude)',
          'OpenAI (GPT-4o, o1)',
          'Google (Gemini)',
          'Mistral',
          'Ollama (local)',
          'OpenRouter',
          'Amazon Bedrock',
          'Azure OpenAI',
          'Groq',
          'Together AI',
        ];
        for (const p of providers) {
          console.log(chalk.gray(`    ○ ${p}`));
        }
        console.log();
      }
    )

    // ── config command ───────────────────────────────────────────
    .command(
      'config',
      chalk.white('Show or edit QuandCode configuration'),
      (yargs) => {
        return yargs
          .option('global', {
            alias: 'g',
            type: 'boolean',
            describe: 'Show global configuration path',
            default: false,
          })
          .option('path', {
            type: 'boolean',
            describe: 'Print the config file path',
            default: false,
          });
      },
      (argv) => {
        printBanner();
        console.log(chalk.cyan('⚙  Configuration'));
        console.log(chalk.gray('─'.repeat(40)));
        console.log();

        const home = process.env.HOME || process.env.USERPROFILE || '~';
        const globalPath = path.join(home, '.config', 'quandcode', 'quandcode.json');
        const localPath = path.join(process.cwd(), 'quandcode.json');

        if (argv.path || argv.global) {
          console.log(chalk.white('  Global: ') + chalk.gray(globalPath));
          console.log(chalk.white('  Local:  ') + chalk.gray(localPath));
          console.log();
          return;
        }

        console.log(chalk.green('✔ Config system initialized'));
        console.log();
        console.log(chalk.white('  Config locations:'));
        console.log(chalk.gray(`    Global: ${globalPath}`));
        console.log(chalk.gray(`    Local:  ${localPath}`));
        console.log();
        console.log(chalk.white('  Current settings:'));
        console.log(chalk.gray('    model:    (default)'));
        console.log(chalk.gray('    provider: (auto-detect)'));
        console.log(chalk.gray('    lsp:      enabled'));
        console.log();
        console.log(
          chalk.gray(
            '  Create a quandcode.json to customize. See docs for schema.'
          )
        );
        console.log();
      }
    )

    // ── Show banner when no command given ────────────────────────
    .command(
      '$0',
      false as unknown as string, // hidden default command
      () => {},
      async () => {
        const { discoverConfig } = await import('../config/index.js');
        const config = discoverConfig();

        let defaultModel = config.model;
        if (!defaultModel) {
          if (config.provider?.google?.apiKey) {
            defaultModel = 'gemini-2.5-flash';
          } else if (config.provider?.anthropic?.apiKey) {
            defaultModel = 'claude-sonnet-4-20250514';
          } else if (config.provider?.openai?.apiKey) {
            defaultModel = 'gpt-4o';
          } else if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
            defaultModel = 'gemini-2.5-flash';
          } else if (process.env.ANTHROPIC_API_KEY) {
            defaultModel = 'claude-sonnet-4-20250514';
          } else if (process.env.OPENAI_API_KEY) {
            defaultModel = 'gpt-4o';
          } else {
            defaultModel = 'claude-sonnet-4-20250514';
          }
        }

        const { getProviderRegistry } = await import('../provider/index.js');
        const registry = getProviderRegistry();
        if (config.provider) {
          for (const [name, provConfig] of Object.entries(config.provider)) {
            registry.setProviderConfig(name, provConfig as any);
          }
        }
        let resolved = registry.resolveModel(defaultModel);
        if (!resolved) {
          let fallbackModel = 'claude-sonnet-4-20250514';
          if (config.provider?.google?.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) {
            fallbackModel = 'gemini-2.5-flash';
          } else if (config.provider?.anthropic?.apiKey || process.env.ANTHROPIC_API_KEY) {
            fallbackModel = 'claude-sonnet-4-20250514';
          } else if (config.provider?.openai?.apiKey || process.env.OPENAI_API_KEY) {
            fallbackModel = 'gpt-4o';
          }
          resolved = registry.resolveModel(fallbackModel);
        }
        const finalModel = resolved?.model.id || defaultModel;
        const provider = resolved?.provider.name || 'anthropic';

        // Launch TUI in interactive REPL mode (no one-shot prompt)
        const { QuandCodeTUI } = await import('../../../tui/src/index.js');
        const tui = new QuandCodeTUI({
          model: finalModel,
          provider,
          mode: 'build',
          autoApprove: false,
        });
        await tui.start();
      }
    )
    .strict()
    .demandCommand(0);

  await cli.parse();
}

// ─── Entry Point ─────────────────────────────────────────────────────
main().catch((err: Error) => {
  console.error(chalk.red(`\n✖ Fatal error: ${err.message}`));
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exit(1);
});
