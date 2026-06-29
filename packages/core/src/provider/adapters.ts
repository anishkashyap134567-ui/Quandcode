// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — LLM API Adapters
// ═══════════════════════════════════════════════════════════
//
// Zero-dependency HTTP fetch adapters for:
// 1. Anthropic (Messages API)
// 2. OpenAI (Chat Completions API)
// 3. Google Gemini (via OpenAI compatibility layer)

import type {
  LLMProvider,
  ProviderModel,
  GenerateOptions,
  GenerateResult,
} from "./types.js";
import { getModelsByProvider } from "./models.js";
import { discoverConfig } from "../config/index.js";

// ── Helper: Safe fetch wrapper ────────────────────────────
async function postJSON(url: string, headers: Record<string, string>, body: any) {
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "Unknown error");
    throw new Error(`API Error [${response.status}]: ${errorText}`);
  }

  return response.json();
}

// ── 1. Anthropic Provider ─────────────────────────────────
export class AnthropicProvider implements LLMProvider {
  readonly name = "anthropic";
  readonly displayName = "Anthropic";

  isConfigured(): boolean {
    if (process.env.ANTHROPIC_API_KEY) return true;
    try {
      const config = discoverConfig();
      return !!config.provider?.anthropic?.apiKey;
    } catch {
      return false;
    }
  }

  listModels(): ProviderModel[] {
    return getModelsByProvider(this.name);
  }

  getModel(modelId: string): ProviderModel | undefined {
    return this.listModels().find((m) => m.id === modelId);
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    let apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      try {
        const config = discoverConfig();
        apiKey = config.provider?.anthropic?.apiKey;
      } catch {}
    }
    if (!apiKey) {
      throw new Error("ANTHROPIC_API_KEY environment variable is not set and could not find key in quandcode.json.");
    }

    const startTime = Date.now();
    const system = options.systemPrompt || "";

    // Map conversation messages to Anthropic format, merging consecutive identical roles
    const anthropicMessages: any[] = [];
    for (const msg of options.messages) {
      if (msg.role === "system") {
        continue;
      }

      if (msg.role === "tool" && msg.toolCallId) {
        // Find or create the last user message to append the tool result to it
        let lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (!lastMsg || lastMsg.role !== "user" || !Array.isArray(lastMsg.content)) {
          lastMsg = { role: "user", content: [] };
          anthropicMessages.push(lastMsg);
        }

        const isError = msg.toolResult && typeof msg.toolResult === "string" && JSON.parse(msg.toolResult).success === false;
        lastMsg.content.push({
          type: "tool_result",
          tool_use_id: msg.toolCallId,
          content: msg.content,
          is_error: isError,
        });
      } else if (msg.role === "assistant") {
        const contentBlocks: any[] = [];
        if (msg.content) {
          contentBlocks.push({ type: "text", text: msg.content });
        }

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          for (const tc of msg.toolCalls) {
            contentBlocks.push({
              type: "tool_use",
              id: tc.id,
              name: tc.name,
              input: tc.args,
            });
          }
        }

        // Handle case where we have consecutive assistant messages (merge them)
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg && lastMsg.role === "assistant" && Array.isArray(lastMsg.content)) {
          lastMsg.content.push(...contentBlocks);
        } else {
          anthropicMessages.push({
            role: "assistant",
            content: contentBlocks.length > 0 ? contentBlocks : [{ type: "text", text: "" }],
          });
        }
      } else {
        // User message
        const lastMsg = anthropicMessages[anthropicMessages.length - 1];
        if (lastMsg && lastMsg.role === "user" && Array.isArray(lastMsg.content)) {
          lastMsg.content.push({ type: "text", text: msg.content });
        } else {
          anthropicMessages.push({
            role: "user",
            content: [{ type: "text", text: msg.content }],
          });
        }
      }
    }

    // Map tools to Anthropic format with Prompt Caching (ephemeral) enabled on the last tool
    const tools = options.tools?.map((t, idx, arr) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters,
      ...(idx === arr.length - 1 ? { cache_control: { type: "ephemeral" } } : {})
    }));

    // Cache control for system prompt if it exists
    const systemPromptBlocks = system ? [
      {
        type: "text",
        text: system,
        cache_control: { type: "ephemeral" }
      }
    ] : undefined;

    // Cache control for the last user message to establish a cache checkpoint for history
    if (anthropicMessages.length > 0) {
      const lastMsg = anthropicMessages[anthropicMessages.length - 1];
      if (lastMsg && Array.isArray(lastMsg.content) && lastMsg.content.length > 0) {
        const lastBlock = lastMsg.content[lastMsg.content.length - 1];
        if (typeof lastBlock === "object") {
          lastBlock.cache_control = { type: "ephemeral" };
        }
      }
    }

    const url = "https://api.anthropic.com/v1/messages";
    const headers = {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "anthropic-beta": "prompt-caching-2024-07-31",
    };

    const body = {
      model: options.model,
      max_tokens: options.maxTokens || 4000,
      system: systemPromptBlocks || undefined,
      messages: anthropicMessages,
      tools: tools && tools.length > 0 ? tools : undefined,
    };

    const data = await postJSON(url, headers, body);
    const durationMs = Date.now() - startTime;

    // Parse the response
    let content = "";
    const toolCalls: any[] = [];

    if (Array.isArray(data.content)) {
      for (const block of data.content) {
        if (block.type === "text") {
          content += block.text;
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id,
            name: block.name,
            args: block.input,
          });
        }
      }
    }

    const finishReason = data.stop_reason === "tool_use" ? "tool_calls" : "stop";

    return {
      content,
      toolCalls,
      usage: {
        inputTokens: data.usage?.input_tokens || 0,
        outputTokens: data.usage?.output_tokens || 0,
      },
      model: options.model,
      provider: this.name,
      durationMs,
      finishReason,
    };
  }
}

// ── 2. OpenAI Provider ────────────────────────────────────
export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  readonly displayName = "OpenAI";

  isConfigured(): boolean {
    if (process.env.OPENAI_API_KEY) return true;
    try {
      const config = discoverConfig();
      return !!config.provider?.openai?.apiKey;
    } catch {
      return false;
    }
  }

  listModels(): ProviderModel[] {
    return getModelsByProvider(this.name);
  }

  getModel(modelId: string): ProviderModel | undefined {
    return this.listModels().find((m) => m.id === modelId);
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    let apiKey = process.env.OPENAI_API_KEY;
    let customBaseURL = "";
    try {
      const config = discoverConfig();
      if (!apiKey) {
        apiKey = config.provider?.openai?.apiKey;
      }
      customBaseURL = config.provider?.openai?.baseURL || "";
      if (customBaseURL && !/^https?:\/\//i.test(customBaseURL)) {
        customBaseURL = `http://${customBaseURL}`;
      }
    } catch {}

    if (!apiKey) {
      throw new Error("OPENAI_API_KEY environment variable is not set and could not find key in quandcode.json.");
    }

    const startTime = Date.now();
    const openAIMessages: any[] = [];

    // Inject system prompt first
    if (options.systemPrompt) {
      openAIMessages.push({ role: "system", content: options.systemPrompt });
    }

    // Map conversation messages to OpenAI format
    for (const msg of options.messages) {
      if (msg.role === "system") {
        continue;
      }

      if (msg.role === "tool" && msg.toolCallId) {
        openAIMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else if (msg.role === "assistant") {
        const oaiMsg: any = {
          role: "assistant",
          content: msg.content || null,
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          oaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }));
        }

        openAIMessages.push(oaiMsg);
      } else {
        openAIMessages.push({
          role: "user",
          content: msg.content,
        });
      }
    }

    // Map tools to OpenAI format
    const tools = options.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const url = customBaseURL ? `${customBaseURL.replace(/\/v1\/?$/, "")}/v1/chat/completions` : "https://api.openai.com/v1/chat/completions";
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    };

    const body = {
      model: options.model,
      messages: openAIMessages,
      tools: tools && tools.length > 0 ? tools : undefined,
      max_completion_tokens: options.maxTokens || undefined,
    };

    const data = await postJSON(url, headers, body);
    const durationMs = Date.now() - startTime;

    // Parse the response
    const choice = data.choices?.[0] || {};
    const content = choice.message?.content || "";
    const toolCalls: any[] = [];

    if (Array.isArray(choice.message?.tool_calls)) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type === "function") {
          try {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            });
          } catch (e) {
            console.warn("Failed to parse tool arguments from OpenAI:", e);
          }
        }
      }
    }

    const finishReason = choice.finish_reason === "tool_calls" ? "tool_calls" : "stop";

    return {
      content,
      toolCalls,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      model: options.model,
      provider: this.name,
      durationMs,
      finishReason,
    };
  }
}

// ── 3. Google Gemini Provider ─────────────────────────────
export class GeminiProvider implements LLMProvider {
  readonly name = "google";
  readonly displayName = "Google Gemini";

  isConfigured(): boolean {
    if (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY) return true;
    try {
      const config = discoverConfig();
      return !!config.provider?.google?.apiKey;
    } catch {
      return false;
    }
  }

  listModels(): ProviderModel[] {
    return getModelsByProvider(this.name);
  }

  getModel(modelId: string): ProviderModel | undefined {
    return this.listModels().find((m) => m.id === modelId);
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    let apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    let customBaseURL = "";
    try {
      const config = discoverConfig();
      if (!apiKey) {
        apiKey = config.provider?.google?.apiKey;
      }
      customBaseURL = config.provider?.google?.baseURL || "";
      if (customBaseURL && !/^https?:\/\//i.test(customBaseURL)) {
        customBaseURL = `http://${customBaseURL}`;
      }
    } catch {}

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY or GOOGLE_API_KEY environment variable is not set and could not find key in quandcode.json.");
    }

    const startTime = Date.now();
    const openAIMessages: any[] = [];

    // Inject system prompt first
    if (options.systemPrompt) {
      openAIMessages.push({ role: "system", content: options.systemPrompt });
    }

    // Map conversation messages to OpenAI compatible format
    for (const msg of options.messages) {
      if (msg.role === "system") {
        continue;
      }

      if (msg.role === "tool" && msg.toolCallId) {
        openAIMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else if (msg.role === "assistant") {
        const oaiMsg: any = {
          role: "assistant",
          content: msg.content || null,
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          oaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }));
        }

        openAIMessages.push(oaiMsg);
      } else {
        openAIMessages.push({
          role: "user",
          content: msg.content,
        });
      }
    }

    // Map tools to OpenAI compatible format
    const tools = options.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    // Use Gemini OpenAI-compatibility endpoint
    const url = customBaseURL ? `${customBaseURL.replace(/\/v1\/?$/, "")}/v1/chat/completions` : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "content-type": "application/json",
    };

    const body = {
      model: options.model,
      messages: openAIMessages,
      tools: tools && tools.length > 0 ? tools : undefined,
    };

    const data = await postJSON(url, headers, body);
    const durationMs = Date.now() - startTime;

    // Parse the response
    const choice = data.choices?.[0] || {};
    const content = choice.message?.content || "";
    const toolCalls: any[] = [];

    if (Array.isArray(choice.message?.tool_calls)) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type === "function") {
          try {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            });
          } catch (e) {
            console.warn("Failed to parse tool arguments from Gemini:", e);
          }
        }
      }
    }

    const finishReason = choice.finish_reason === "tool_calls" ? "tool_calls" : "stop";

    return {
      content,
      toolCalls,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      model: options.model,
      provider: this.name,
      durationMs,
      finishReason,
    };
  }
}

// ── 4. Ollama Provider ────────────────────────────────────
export class OllamaProvider implements LLMProvider {
  readonly name = "ollama";
  readonly displayName = "Ollama";

  isConfigured(): boolean {
    // Ollama is a local provider, so it is always assumed configured
    return true;
  }

  listModels(): ProviderModel[] {
    return getModelsByProvider(this.name);
  }

  getModel(modelId: string): ProviderModel | undefined {
    return this.listModels().find((m) => m.id === modelId);
  }

  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const startTime = Date.now();
    let baseURL = "http://127.0.0.1:11434";
    try {
      const config = discoverConfig();
      if (config.provider?.ollama?.baseURL) {
        baseURL = config.provider.ollama.baseURL;
      }
      if (baseURL && !/^https?:\/\//i.test(baseURL)) {
        baseURL = `http://${baseURL}`;
      }
    } catch {}

    const ollamaMessages: any[] = [];

    // Inject system prompt first
    if (options.systemPrompt) {
      ollamaMessages.push({ role: "system", content: options.systemPrompt });
    }

    // Map conversation messages to Ollama format
    for (const msg of options.messages) {
      if (msg.role === "system") {
        continue;
      }

      if (msg.role === "tool" && msg.toolCallId) {
        ollamaMessages.push({
          role: "tool",
          tool_call_id: msg.toolCallId,
          content: msg.content,
        });
      } else if (msg.role === "assistant") {
        const oaiMsg: any = {
          role: "assistant",
          content: msg.content || null,
        };

        if (msg.toolCalls && msg.toolCalls.length > 0) {
          oaiMsg.tool_calls = msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function",
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.args),
            },
          }));
        }

        ollamaMessages.push(oaiMsg);
      } else {
        ollamaMessages.push({
          role: "user",
          content: msg.content,
        });
      }
    }

    // Map tools to Ollama format
    const tools = options.tools?.map((t) => ({
      type: "function" as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const cleanBaseURL = baseURL.replace(/\/v1\/?$/, "");
    const url = `${cleanBaseURL}/v1/chat/completions`;
    const headers = {
      "content-type": "application/json",
    };

    const body = {
      model: options.model,
      messages: ollamaMessages,
      tools: tools && tools.length > 0 ? tools : undefined,
      max_completion_tokens: options.maxTokens || undefined,
    };

    const data = await postJSON(url, headers, body);
    const durationMs = Date.now() - startTime;

    // Parse response
    const choice = data.choices?.[0] || {};
    const content = choice.message?.content || "";
    const toolCalls: any[] = [];

    if (Array.isArray(choice.message?.tool_calls)) {
      for (const tc of choice.message.tool_calls) {
        if (tc.type === "function") {
          try {
            toolCalls.push({
              id: tc.id,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments),
            });
          } catch (e) {
            console.warn("Failed to parse tool arguments from Ollama:", e);
          }
        }
      }
    }

    const finishReason = choice.finish_reason === "tool_calls" ? "tool_calls" : "stop";

    return {
      content,
      toolCalls,
      usage: {
        inputTokens: data.usage?.prompt_tokens || 0,
        outputTokens: data.usage?.completion_tokens || 0,
      },
      model: options.model,
      provider: this.name,
      durationMs,
      finishReason,
    };
  }
}
