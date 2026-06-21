import { z } from 'zod';
import * as fs from 'node:fs';
import * as path from 'node:path';

// Permission levels for tools
const PermissionLevel = z.enum(['allow', 'ask', 'deny']);

// Provider configuration
const ProviderConfig = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  models: z.record(z.string(), z.object({})).optional(),
}).passthrough();

// LSP configuration
const LSPConfig = z.union([
  z.boolean(),
  z.record(z.string(), z.object({
    command: z.union([z.string(), z.array(z.string())]),
    args: z.array(z.string()).optional(),
    extensions: z.array(z.string()).optional(),
    disabled: z.boolean().optional(),
  })),
]);

// Agent configuration
const AgentConfig = z.object({
  model: z.string().optional(),
  provider: z.string().optional(),
  systemPrompt: z.string().optional(),
  tools: z.array(z.string()).optional(),
});

// Full QuandCode configuration schema
export const QuandCodeConfigSchema = z.object({
  $schema: z.string().optional(),
  provider: z.record(z.string(), ProviderConfig).optional(),
  permission: z.object({
    read: PermissionLevel.default('allow'),
    write: PermissionLevel.default('ask'),
    edit: PermissionLevel.default('allow'),
    bash: PermissionLevel.default('ask'),
    external_directory: z.record(z.string(), PermissionLevel).optional(),
  }).optional(),
  lsp: LSPConfig.optional(),
  agent: z.object({
    plan: AgentConfig.optional(),
    build: AgentConfig.optional(),
  }).optional(),
  model: z.string().optional(),
});

export type QuandCodeConfig = z.infer<typeof QuandCodeConfigSchema>;

// Config file discovery: looks for quandcode.json in CWD, then parent dirs, and merges with global config
export function discoverConfig(cwd: string = process.cwd()): QuandCodeConfig {
  // 1. Load global config if it exists
  let globalConfig: any = {};
  const globalPath = getGlobalConfigPath();
  if (fs.existsSync(globalPath)) {
    try {
      const raw = fs.readFileSync(globalPath, 'utf-8');
      const cleaned = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      globalConfig = JSON.parse(cleaned);
    } catch (err) {
      // Ignore global config parse error
    }
  }

  // 2. Discover local config (walking up from cwd)
  const configNames = ['quandcode.json', 'quandcode.jsonc', '.quandcode/quandcode.json'];
  let dir = cwd;
  let localConfig: any = {};

  while (true) {
    let found = false;
    for (const name of configNames) {
      const configPath = path.join(dir, name);
      if (fs.existsSync(configPath)) {
        try {
          const raw = fs.readFileSync(configPath, 'utf-8');
          const cleaned = raw.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
          localConfig = JSON.parse(cleaned);
          found = true;
          break;
        } catch (err) {
          console.warn(`Warning: Failed to parse config at ${configPath}`);
        }
      }
    }
    if (found) break;

    const parent = path.dirname(dir);
    if (parent === dir) break; // Reached root
    dir = parent;
  }

  // 3. Deep merge global and local configs (local overrides global)
  const merged = {
    ...globalConfig,
    ...localConfig,
    provider: {
      ...(globalConfig.provider || {}),
      ...(localConfig.provider || {}),
    },
    permission: {
      ...(globalConfig.permission || {}),
      ...(localConfig.permission || {}),
    },
    agent: {
      ...(globalConfig.agent || {}),
      ...(localConfig.agent || {}),
    },
  };

  // Ensure individual provider settings are merged
  if (globalConfig.provider && localConfig.provider) {
    const allProviders = new Set([
      ...Object.keys(globalConfig.provider),
      ...Object.keys(localConfig.provider),
    ]);
    for (const key of allProviders) {
      merged.provider[key] = {
        ...(globalConfig.provider[key] || {}),
        ...(localConfig.provider[key] || {}),
      };
    }
  }

  const config = QuandCodeConfigSchema.parse(merged);

  // Automatically load API keys from config into process.env if not already set
  if (config.provider) {
    if (config.provider.anthropic?.apiKey && !process.env.ANTHROPIC_API_KEY) {
      process.env.ANTHROPIC_API_KEY = config.provider.anthropic.apiKey;
    }
    if (config.provider.openai?.apiKey && !process.env.OPENAI_API_KEY) {
      process.env.OPENAI_API_KEY = config.provider.openai.apiKey;
    }
    if (config.provider.google?.apiKey && !process.env.GEMINI_API_KEY && !process.env.GOOGLE_API_KEY) {
      process.env.GEMINI_API_KEY = config.provider.google.apiKey;
      process.env.GOOGLE_API_KEY = config.provider.google.apiKey;
    }
  }

  return config;
}

// Get the global config path
export function getGlobalConfigPath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || '';
  return path.join(home, '.config', 'quandcode', 'quandcode.json');
}

export function getProjectConfigPath(cwd: string = process.cwd()): string {
  return path.join(cwd, 'quandcode.json');
}
