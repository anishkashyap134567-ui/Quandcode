// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Model Catalog
// ═══════════════════════════════════════════════════════════
//
// Comprehensive database of LLM models, their capabilities,
// context windows, and pricing. Updated for mid-2025 models.

import type { ProviderModel } from "./types.js";

// ── Model Definitions ─────────────────────────────────────

export const MODEL_CATALOG: ProviderModel[] = [
  // ── Anthropic ───────────────────────────────────────────
  {
    id: "claude-opus-4-20250514",
    provider: "anthropic",
    displayName: "Claude Opus 4",
    contextWindow: 200_000,
    maxOutputTokens: 32_000,
    inputCostPerMillion: 15_000,
    outputCostPerMillion: 75_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "claude-sonnet-4-20250514",
    provider: "anthropic",
    displayName: "Claude Sonnet 4",
    contextWindow: 200_000,
    maxOutputTokens: 16_000,
    inputCostPerMillion: 3_000,
    outputCostPerMillion: 15_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "claude-3-5-sonnet-20241022",
    provider: "anthropic",
    displayName: "Claude 3.5 Sonnet",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 3_000,
    outputCostPerMillion: 15_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "claude-3-5-haiku-20241022",
    provider: "anthropic",
    displayName: "Claude 3.5 Haiku",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 1_000,
    outputCostPerMillion: 5_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },

  // ── OpenAI ──────────────────────────────────────────────
  {
    id: "gpt-4o",
    provider: "openai",
    displayName: "GPT-4o",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCostPerMillion: 2_500,
    outputCostPerMillion: 10_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "gpt-4o-mini",
    provider: "openai",
    displayName: "GPT-4o Mini",
    contextWindow: 128_000,
    maxOutputTokens: 16_384,
    inputCostPerMillion: 150,
    outputCostPerMillion: 600,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "o1",
    provider: "openai",
    displayName: "o1 (Reasoning)",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    inputCostPerMillion: 15_000,
    outputCostPerMillion: 60_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "o3",
    provider: "openai",
    displayName: "o3 (Reasoning)",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    inputCostPerMillion: 10_000,
    outputCostPerMillion: 40_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "o3-mini",
    provider: "openai",
    displayName: "o3-mini",
    contextWindow: 200_000,
    maxOutputTokens: 100_000,
    inputCostPerMillion: 1_100,
    outputCostPerMillion: 4_400,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },

  // ── Google ──────────────────────────────────────────────
  {
    id: "gemini-2.5-pro",
    provider: "google",
    displayName: "Gemini 2.5 Pro",
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    inputCostPerMillion: 1_250,
    outputCostPerMillion: 10_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "gemini-2.5-flash",
    provider: "google",
    displayName: "Gemini 2.5 Flash",
    contextWindow: 1_000_000,
    maxOutputTokens: 65_536,
    inputCostPerMillion: 150,
    outputCostPerMillion: 600,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },
  {
    id: "gemini-2.0-flash",
    provider: "google",
    displayName: "Gemini 2.0 Flash",
    contextWindow: 1_000_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 75,
    outputCostPerMillion: 300,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },

  // ── Mistral ─────────────────────────────────────────────
  {
    id: "mistral-large-latest",
    provider: "mistral",
    displayName: "Mistral Large",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 2_000,
    outputCostPerMillion: 6_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: "codestral-latest",
    provider: "mistral",
    displayName: "Codestral",
    contextWindow: 256_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 300,
    outputCostPerMillion: 900,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },

  // ── DeepSeek ────────────────────────────────────────────
  {
    id: "deepseek-chat",
    provider: "deepseek",
    displayName: "DeepSeek V3",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 270,
    outputCostPerMillion: 1_100,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: "deepseek-reasoner",
    provider: "deepseek",
    displayName: "DeepSeek R1",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 550,
    outputCostPerMillion: 2_190,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },

  // ── Groq ────────────────────────────────────────────────
  {
    id: "llama-3.3-70b-versatile",
    provider: "groq",
    displayName: "Llama 3.3 70B (Groq)",
    contextWindow: 128_000,
    maxOutputTokens: 32_768,
    inputCostPerMillion: 590,
    outputCostPerMillion: 790,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: "mixtral-8x7b-32768",
    provider: "groq",
    displayName: "Mixtral 8x7B (Groq)",
    contextWindow: 32_768,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 240,
    outputCostPerMillion: 240,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },

  // ── Together AI ─────────────────────────────────────────
  {
    id: "meta-llama/Meta-Llama-3.1-405B-Instruct-Turbo",
    provider: "together",
    displayName: "Llama 3.1 405B (Together)",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    inputCostPerMillion: 3_500,
    outputCostPerMillion: 3_500,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },

  // ── xAI ─────────────────────────────────────────────────
  {
    id: "grok-2",
    provider: "xai",
    displayName: "Grok 2",
    contextWindow: 131_072,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 2_000,
    outputCostPerMillion: 10_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: true,
  },

  // ── Cohere ──────────────────────────────────────────────
  {
    id: "command-r-plus",
    provider: "cohere",
    displayName: "Command R+",
    contextWindow: 128_000,
    maxOutputTokens: 4_096,
    inputCostPerMillion: 2_500,
    outputCostPerMillion: 10_000,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },

  // ── Perplexity ──────────────────────────────────────────
  {
    id: "sonar-pro",
    provider: "perplexity",
    displayName: "Sonar Pro",
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 3_000,
    outputCostPerMillion: 15_000,
    supportsToolCalling: false,
    supportsStreaming: true,
    supportsVision: false,
  },

  // ── Fireworks ───────────────────────────────────────────
  {
    id: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    provider: "fireworks",
    displayName: "Llama 3.3 70B (Fireworks)",
    contextWindow: 128_000,
    maxOutputTokens: 8_192,
    inputCostPerMillion: 900,
    outputCostPerMillion: 900,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },

  // ── Ollama (Local) ──────────────────────────────────────
  {
    id: "llama3",
    provider: "ollama",
    displayName: "Llama 3 (Local)",
    contextWindow: 8192,
    maxOutputTokens: 2048,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: "llama3.1",
    provider: "ollama",
    displayName: "Llama 3.1 (Local)",
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: "qwen2.5-coder",
    provider: "ollama",
    displayName: "Qwen 2.5 Coder (Local)",
    contextWindow: 128000,
    maxOutputTokens: 8192,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: "mistral",
    provider: "ollama",
    displayName: "Mistral (Local)",
    contextWindow: 32768,
    maxOutputTokens: 8192,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
  {
    id: "phi3",
    provider: "ollama",
    displayName: "Phi 3 (Local)",
    contextWindow: 128000,
    maxOutputTokens: 4096,
    inputCostPerMillion: 0,
    outputCostPerMillion: 0,
    supportsToolCalling: true,
    supportsStreaming: true,
    supportsVision: false,
  },
];

// ── Helper Functions ──────────────────────────────────────

/**
 * Get all models for a specific provider.
 */
export function getModelsByProvider(provider: string): ProviderModel[] {
  return MODEL_CATALOG.filter((m) => m.provider === provider);
}

/**
 * Get a model by its ID (searches all providers).
 */
export function getModelById(modelId: string): ProviderModel | undefined {
  return MODEL_CATALOG.find((m) => m.id === modelId);
}

/**
 * Get all unique provider names.
 */
export function getProviderNames(): string[] {
  return [...new Set(MODEL_CATALOG.map((m) => m.provider))];
}

/**
 * Calculate cost for a given number of tokens.
 * Returns cost in microdollars (1/1,000,000 of a dollar).
 */
export function calculateCost(
  model: ProviderModel,
  inputTokens: number,
  outputTokens: number
): number {
  const inputCost = Math.ceil(
    (inputTokens / 1_000_000) * model.inputCostPerMillion
  );
  const outputCost = Math.ceil(
    (outputTokens / 1_000_000) * model.outputCostPerMillion
  );
  return inputCost + outputCost;
}

/**
 * Format microdollars as a human-readable string.
 */
export function formatCost(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  if (dollars < 0.01) return `$${dollars.toFixed(6)}`;
  if (dollars < 1) return `$${dollars.toFixed(4)}`;
  return `$${dollars.toFixed(2)}`;
}
