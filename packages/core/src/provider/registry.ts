// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Provider Registry
// ═══════════════════════════════════════════════════════════
//
// Central registry that manages all LLM providers.
// Handles provider discovery, configuration, and model resolution.

import type {
  LLMProvider,
  ProviderModel,
  GenerateOptions,
  GenerateResult,
  ProviderConfig,
} from "./types.js";
import { AnthropicProvider, OpenAIProvider, GeminiProvider, OllamaProvider } from "./adapters.js";
import {
  MODEL_CATALOG,
  getModelById,
  getProviderNames,
  getModelsByProvider,
  calculateCost,
  formatCost,
} from "./models.js";

// ── Provider Registry ─────────────────────────────────────

export class ProviderRegistry {
  private providers: Map<string, LLMProvider> = new Map();
  private configs: Map<string, ProviderConfig> = new Map();
  private defaultProvider: string | null = null;
  private defaultModel: string | null = null;

  /**
   * Register a provider implementation.
   */
  registerProvider(provider: LLMProvider): void {
    this.providers.set(provider.name, provider);
  }

  /**
   * Set provider configuration.
   */
  setProviderConfig(name: string, config: ProviderConfig): void {
    this.configs.set(name, config);
  }

  /**
   * Set default provider and model.
   */
  setDefaults(provider: string, model: string): void {
    this.defaultProvider = provider;
    this.defaultModel = model;
  }

  /**
   * Get a provider by name.
   */
  getProvider(name: string): LLMProvider | undefined {
    return this.providers.get(name);
  }

  /**
   * List all registered providers.
   */
  listProviders(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * List all providers that are configured (have API keys).
   */
  listConfiguredProviders(): LLMProvider[] {
    return this.listProviders().filter((p) => p.isConfigured());
  }

  /**
   * Resolve a model ID to its provider and model details.
   * Supports formats:
   *   - "claude-sonnet-4-20250514" (auto-detect provider)
   *   - "anthropic/claude-sonnet-4-20250514" (explicit provider)
   */
  resolveModel(modelSpec: string): {
    provider: LLMProvider;
    model: ProviderModel;
  } | null {
    let providerName: string | undefined;
    let modelId: string;

    // Check for provider/model format
    if (modelSpec.includes("/")) {
      const parts = modelSpec.split("/");
      // Handle IDs like "meta-llama/Meta-Llama-..." which are model IDs, not provider/model
      const possibleProvider = parts[0];
      if (this.providers.has(possibleProvider)) {
        providerName = possibleProvider;
        modelId = parts.slice(1).join("/");
      } else {
        modelId = modelSpec;
      }
    } else {
      modelId = modelSpec;
    }

    // Look up in catalog
    const catalogModel = getModelById(modelId) ||
      getModelById(modelSpec);

    if (catalogModel) {
      providerName = providerName || catalogModel.provider;
    }

    if (!providerName) {
      // Try to find the model across all providers
      for (const [name, provider] of this.providers) {
        const model = provider.getModel(modelId);
        if (model) {
          providerName = name;
          break;
        }
      }
    }

    // Support dynamic resolving for ollama/ prefixed models not in catalog
    if (!providerName && modelSpec.startsWith("ollama/")) {
      providerName = "ollama";
      modelId = modelSpec.split("/")[1] || modelSpec;
    }

    if (!providerName) return null;

    const provider = this.providers.get(providerName);
    if (!provider) return null;

    let model = catalogModel || provider.getModel(modelId);
    if (!model) {
      if (providerName === "ollama") {
        model = {
          id: modelId,
          provider: "ollama",
          displayName: `Ollama - ${modelId}`,
          contextWindow: 128000,
          maxOutputTokens: 8192,
          inputCostPerMillion: 0,
          outputCostPerMillion: 0,
          supportsToolCalling: true,
          supportsStreaming: true,
          supportsVision: false,
        };
      } else {
        return null;
      }
    }

    return { provider, model };
  }

  /**
   * Generate a response using the specified or default model.
   */
  async generate(options: GenerateOptions): Promise<GenerateResult> {
    const modelSpec = options.model || this.defaultModel;
    if (!modelSpec) {
      throw new Error(
        "No model specified and no default model configured. " +
        "Set a model with: quandcode config or pass --model flag."
      );
    }

    const resolved = this.resolveModel(modelSpec);
    if (!resolved) {
      throw new Error(
        `Model "${modelSpec}" not found. Run 'quandcode models' to see available models.`
      );
    }

    if (!resolved.provider.isConfigured()) {
      throw new Error(
        `Provider "${resolved.provider.name}" is not configured. ` +
        `Set your API key in quandcode.json or as an environment variable.`
      );
    }

    return resolved.provider.generate({
      ...options,
      model: resolved.model.id,
    });
  }

  /**
   * List all available models across all providers.
   */
  listAllModels(): ProviderModel[] {
    const models: ProviderModel[] = [];
    for (const provider of this.providers.values()) {
      models.push(...provider.listModels());
    }
    return models;
  }

  /**
   * Get a summary of all providers and their models.
   */
  getSummary(): Array<{
    provider: string;
    displayName: string;
    configured: boolean;
    models: ProviderModel[];
  }> {
    return this.listProviders().map((p) => ({
      provider: p.name,
      displayName: p.displayName,
      configured: p.isConfigured(),
      models: p.listModels(),
    }));
  }
}

// ── Singleton Registry ────────────────────────────────────
let _globalRegistry: ProviderRegistry | null = null;

export function getProviderRegistry(): ProviderRegistry {
  if (!_globalRegistry) {
    _globalRegistry = new ProviderRegistry();
    _globalRegistry.registerProvider(new AnthropicProvider());
    _globalRegistry.registerProvider(new OpenAIProvider());
    _globalRegistry.registerProvider(new GeminiProvider());
    _globalRegistry.registerProvider(new OllamaProvider());
  }
  return _globalRegistry;
}

// Re-export utilities
export { getModelById, getModelsByProvider, getProviderNames, calculateCost, formatCost };
export { MODEL_CATALOG } from "./models.js";
