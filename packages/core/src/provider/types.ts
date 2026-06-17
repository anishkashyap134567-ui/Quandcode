// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Provider Abstraction Layer
// ═══════════════════════════════════════════════════════════
//
// Unified interface for 75+ LLM providers via Vercel AI SDK.
// Each provider implements a common contract for:
// - Model resolution
// - Streaming text generation
// - Tool calling
// - Token tracking
//
// Supported providers:
// Anthropic, OpenAI, Google, Mistral, Ollama, Groq, Together,
// OpenRouter, AWS Bedrock, Azure OpenAI, Fireworks, Cohere,
// DeepSeek, Perplexity, xAI, and any OpenAI-compatible endpoint.

import { z } from "zod";

// ── Provider Types ────────────────────────────────────────

export interface ProviderModel {
  /** Model identifier (e.g., "claude-sonnet-4-20250514") */
  id: string;
  /** Provider name (e.g., "anthropic") */
  provider: string;
  /** Human-readable model name */
  displayName: string;
  /** Context window size in tokens */
  contextWindow: number;
  /** Maximum output tokens */
  maxOutputTokens: number;
  /** Cost per million input tokens (microdollars) */
  inputCostPerMillion: number;
  /** Cost per million output tokens (microdollars) */
  outputCostPerMillion: number;
  /** Does this model support tool/function calling? */
  supportsToolCalling: boolean;
  /** Does this model support streaming? */
  supportsStreaming: boolean;
  /** Does this model support vision (image input)? */
  supportsVision: boolean;
}

export interface StreamChunk {
  type: "text" | "tool_call" | "usage" | "done" | "error";
  text?: string;
  toolCall?: {
    id: string;
    name: string;
    args: string; // JSON string (streamed incrementally)
  };
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: string;
}

export interface GenerateOptions {
  model: string;
  messages: Array<{
    role: "user" | "assistant" | "tool" | "system";
    content: string;
    toolCalls?: Array<{
      id: string;
      name: string;
      args: Record<string, unknown>;
    }>;
    toolCallId?: string;
    toolResult?: unknown;
  }>;
  systemPrompt?: string;
  tools?: Array<{
    name: string;
    description: string;
    parameters: z.ZodType;
  }>;
  temperature?: number;
  maxTokens?: number;
  onChunk?: (chunk: StreamChunk) => void;
  signal?: AbortSignal;
}

export interface GenerateResult {
  content: string;
  toolCalls: Array<{
    id: string;
    name: string;
    args: Record<string, unknown>;
  }>;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  model: string;
  provider: string;
  durationMs: number;
  finishReason: "stop" | "tool_calls" | "length" | "error";
}

// ── Provider Interface ────────────────────────────────────

export interface LLMProvider {
  /** Provider identifier (e.g., "anthropic", "openai") */
  readonly name: string;

  /** Human-readable provider name */
  readonly displayName: string;

  /** Check if the provider is configured (has API key) */
  isConfigured(): boolean;

  /** List available models for this provider */
  listModels(): ProviderModel[];

  /** Get a specific model by ID */
  getModel(modelId: string): ProviderModel | undefined;

  /** Generate a response (streaming) */
  generate(options: GenerateOptions): Promise<GenerateResult>;
}

// ── Provider Configuration Schema ─────────────────────────

export const ProviderConfigSchema = z.object({
  apiKey: z.string().optional(),
  baseURL: z.string().optional(),
  models: z.record(z.string(), z.object({}).passthrough()).optional(),
  timeout: z.number().optional(),
  maxRetries: z.number().optional(),
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
