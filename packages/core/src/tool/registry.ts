// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Tool Registry
// ═══════════════════════════════════════════════════════════
//
// Central registry for all tools. Handles:
// - Tool registration and lookup
// - Input validation (via Zod schemas)
// - Permission checking (via PermissionManager)
// - Tool execution with error handling
// - JSON Schema generation for LLM tool descriptions
//
// Tools are registered at startup and available to the agent.

import { z, ZodError } from "zod";
import type {
  ToolDefinition,
  ToolResult,
  ToolContext,
  ToolCall,
  ToolCallResult,
  ToolCategory,
} from "./types.js";
import { PermissionManager } from "./permissions.js";

// ── Tool Registry ─────────────────────────────────────────

export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private permissions: PermissionManager;

  constructor(permissions?: PermissionManager) {
    this.permissions = permissions || new PermissionManager();
  }

  /**
   * Get the permission manager.
   */
  getPermissions(): PermissionManager {
    return this.permissions;
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ REGISTRATION
  // ╚═══════════════════════════════════════════════════════

  /**
   * Register a tool.
   */
  register<T extends z.ZodType>(tool: ToolDefinition<T>): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool "${tool.name}" is already registered.`);
    }
    this.tools.set(tool.name, tool as unknown as ToolDefinition);
  }

  /**
   * Register multiple tools at once.
   */
  registerAll(tools: ToolDefinition[]): void {
    for (const tool of tools) {
      this.register(tool);
    }
  }

  /**
   * Unregister a tool.
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ LOOKUP
  // ╚═══════════════════════════════════════════════════════

  /**
   * Get a tool by name.
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Check if a tool exists.
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * List all registered tools.
   */
  listAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * List tools by category.
   */
  listByCategory(category: ToolCategory): ToolDefinition[] {
    return this.listAll().filter((t) => t.category === category);
  }

  /**
   * List tools available in the current agent mode.
   */
  listAvailable(agentMode: "build" | "plan"): ToolDefinition[] {
    return this.listAll().filter((tool) => {
      const modeCheck = this.permissions.checkAgentMode(tool, agentMode);
      return modeCheck.allowed;
    });
  }

  /**
   * Get tool count.
   */
  get size(): number {
    return this.tools.size;
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ VALIDATION
  // ╚═══════════════════════════════════════════════════════

  /**
   * Validate arguments against a tool's Zod schema.
   */
  validate(
    toolName: string,
    rawArgs: Record<string, unknown>
  ): { valid: true; args: unknown } | { valid: false; error: string } {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { valid: false, error: `Tool "${toolName}" not found.` };
    }

    try {
      const parsed = tool.parameters.parse(rawArgs);
      return { valid: true, args: parsed };
    } catch (err) {
      if (err instanceof ZodError) {
        const issues = err.issues.map(
          (i) => `  - ${i.path.join(".")}: ${i.message}`
        );
        return {
          valid: false,
          error: `Invalid arguments for tool "${toolName}":\n${issues.join("\n")}`,
        };
      }
      return {
        valid: false,
        error: `Validation error: ${(err as Error).message}`,
      };
    }
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ EXECUTION
  // ╚═══════════════════════════════════════════════════════

  /**
   * Execute a single tool call.
   * Handles: validation → permission → execution → error wrapping.
   */
  async executeTool(
    call: ToolCall,
    context: ToolContext
  ): Promise<ToolCallResult> {
    const startTime = Date.now();

    // 1. Check tool exists
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        callId: call.id,
        name: call.name,
        result: {
          success: false,
          output: "",
          error: `Unknown tool: "${call.name}". Available tools: ${Array.from(this.tools.keys()).join(", ")}`,
        },
      };
    }

    // 2. Check agent mode permissions
    const modeCheck = this.permissions.checkAgentMode(tool, context.agentMode);
    if (!modeCheck.allowed) {
      return {
        callId: call.id,
        name: call.name,
        result: {
          success: false,
          output: "",
          error: modeCheck.reason,
        },
        permissionDenied: true,
      };
    }

    // 3. Check permission level (allow/ask/deny)
    const permCheck = await this.permissions.checkPermission(call.name);
    if (!permCheck.allowed) {
      return {
        callId: call.id,
        name: call.name,
        result: {
          success: false,
          output: "",
          error: permCheck.reason,
        },
        permissionDenied: true,
      };
    }

    // 4. Validate arguments
    const validation = this.validate(call.name, call.rawArgs);
    if (!validation.valid) {
      return {
        callId: call.id,
        name: call.name,
        result: {
          success: false,
          output: "",
          error: validation.error,
        },
        validationError: validation.error,
      };
    }

    // 5. Execute tool
    try {
      const result = await tool.execute(validation.args, context);
      result.durationMs = Date.now() - startTime;
      return {
        callId: call.id,
        name: call.name,
        result,
      };
    } catch (err) {
      return {
        callId: call.id,
        name: call.name,
        result: {
          success: false,
          output: "",
          error: `Tool "${call.name}" threw an error: ${(err as Error).message}`,
          durationMs: Date.now() - startTime,
        },
      };
    }
  }

  /**
   * Execute multiple tool calls (concurrent where safe).
   */
  async executeToolCalls(
    calls: ToolCall[],
    context: ToolContext
  ): Promise<ToolCallResult[]> {
    // Separate concurrent-safe and sequential calls
    const safeCalls: ToolCall[] = [];
    const sequentialCalls: ToolCall[] = [];

    for (const call of calls) {
      const tool = this.tools.get(call.name);
      if (tool?.isConcurrencySafe) {
        safeCalls.push(call);
      } else {
        sequentialCalls.push(call);
      }
    }

    const results: ToolCallResult[] = [];

    // Run concurrent-safe calls in parallel
    if (safeCalls.length > 0) {
      const concurrent = await Promise.all(
        safeCalls.map((call) => this.executeTool(call, context))
      );
      results.push(...concurrent);
    }

    // Run sequential calls one by one
    for (const call of sequentialCalls) {
      const result = await this.executeTool(call, context);
      results.push(result);
    }

    return results;
  }

  // ╔═══════════════════════════════════════════════════════
  // ║ JSON SCHEMA GENERATION (for LLM)
  // ╚═══════════════════════════════════════════════════════

  /**
   * Generate JSON Schema descriptions for all available tools.
   * Used by the provider abstraction to send tool definitions to the LLM.
   */
  generateToolSchemas(
    agentMode: "build" | "plan" = "build"
  ): Array<{
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }> {
    const available = this.listAvailable(agentMode);

    return available.map((tool) => ({
      name: tool.name,
      description: tool.description + (tool.longDescription ? `\n\n${tool.longDescription}` : ""),
      parameters: this.zodToJsonSchema(tool.parameters),
    }));
  }

  /**
   * Convert a Zod schema to a simplified JSON Schema.
   * Handles the most common Zod types used in tool definitions.
   */
  private zodToJsonSchema(schema: z.ZodType): Record<string, unknown> {
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];

      for (const [key, value] of Object.entries(shape)) {
        const zodValue = value as z.ZodType;
        properties[key] = this.zodTypeToJson(zodValue);

        // Check if required (not optional, not with default)
        if (
          !(zodValue instanceof z.ZodOptional) &&
          !(zodValue instanceof z.ZodDefault)
        ) {
          required.push(key);
        }
      }

      return {
        type: "object",
        properties,
        ...(required.length > 0 ? { required } : {}),
      };
    }

    return { type: "object" };
  }

  /**
   * Convert individual Zod types to JSON Schema types.
   */
  private zodTypeToJson(schema: z.ZodType): Record<string, unknown> {
    // Unwrap optional/default
    if (schema instanceof z.ZodOptional) {
      return this.zodTypeToJson(schema.unwrap());
    }
    if (schema instanceof z.ZodDefault) {
      const inner = this.zodTypeToJson(schema.removeDefault());
      return { ...inner, default: schema._def.defaultValue() };
    }

    // Primitive types
    if (schema instanceof z.ZodString) {
      const result: Record<string, unknown> = { type: "string" };
      if (schema.description) result.description = schema.description;
      return result;
    }
    if (schema instanceof z.ZodNumber) {
      const result: Record<string, unknown> = { type: "number" };
      if (schema.description) result.description = schema.description;
      return result;
    }
    if (schema instanceof z.ZodBoolean) {
      return { type: "boolean" };
    }

    // Enum
    if (schema instanceof z.ZodEnum) {
      return { type: "string", enum: schema.options };
    }

    // Array
    if (schema instanceof z.ZodArray) {
      return {
        type: "array",
        items: this.zodTypeToJson(schema.element),
      };
    }

    // Union
    if (schema instanceof z.ZodUnion) {
      return {
        oneOf: (schema.options as z.ZodType[]).map((o) => this.zodTypeToJson(o)),
      };
    }

    // Record
    if (schema instanceof z.ZodRecord) {
      return {
        type: "object",
        additionalProperties: this.zodTypeToJson(schema.valueSchema),
      };
    }

    // Nested object
    if (schema instanceof z.ZodObject) {
      return this.zodToJsonSchema(schema);
    }

    // Fallback
    return { type: "string" };
  }
}
