// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — lsp_query Tool
// ═══════════════════════════════════════════════════════════
//
// Queries the active language server for definitions,
// references, or diagnostics.

import { z } from "zod";
import * as path from "node:path";
import * as fs from "node:fs";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";
import { LSPClient } from "../../lsp/client.js";

// Global LSP client instance (in a real app, this would be managed by the SessionManager)
let globalLspClient: LSPClient | null = null;

// ── Parameters Schema ─────────────────────────────────────

export const LspQueryParams = z.object({
  action: z.enum(["definition", "references", "diagnostics"]).describe("The LSP action to perform"),
  path: z.string().optional().describe("File path to query (required for definition/references)"),
  line: z.number().optional().describe("Line number, 1-indexed (required for definition/references)"),
  character: z.number().optional().describe("Character column, 1-indexed (required for definition/references)"),
});

type LspQueryArgs = z.infer<typeof LspQueryParams>;

// ── Implementation ────────────────────────────────────────

async function execute(args: LspQueryArgs, context: ToolContext): Promise<ToolResult> {
  // Initialize LSP client if not already running
  if (!globalLspClient) {
    // Basic setup for typescript/javascript. In a full implementation,
    // this would be configurable via `quandcode.json`.
    let command = "npx";
    let commandArgs = ["typescript-language-server", "--stdio"];
    
    // Fallback to checking if we're in a rust project
    if (fs.existsSync(path.join(context.cwd, "Cargo.toml"))) {
      command = "rust-analyzer";
      commandArgs = [];
    }

    globalLspClient = new LSPClient({
      command,
      args: commandArgs,
      cwd: context.cwd,
    });
    
    try {
      await globalLspClient.start();
    } catch (e) {
      globalLspClient = null;
      return {
        success: false,
        output: "",
        error: `Failed to start language server: ${(e as Error).message}. Ensure it is installed.`,
      };
    }
  }

  const filePath = args.path
    ? path.isAbsolute(args.path) ? args.path : path.resolve(context.cwd, args.path)
    : "";

  try {
    if (args.action === "definition") {
      if (!filePath || !args.line || !args.character) {
        return { success: false, output: "", error: "Missing required arguments: path, line, character" };
      }
      
      const defs = await globalLspClient.getDefinition(filePath, args.line, args.character);
      if (defs.length === 0) {
        return { success: true, output: "No definitions found." };
      }
      
      const formatted = defs.map(d => `${d.uri.replace("file://", "")}:${d.range.start.line + 1}:${d.range.start.character + 1}`).join("\n");
      return { success: true, output: `Found definitions:\n${formatted}` };
      
    } else if (args.action === "references") {
      if (!filePath || !args.line || !args.character) {
        return { success: false, output: "", error: "Missing required arguments: path, line, character" };
      }
      
      const refs = await globalLspClient.getReferences(filePath, args.line, args.character);
      if (refs.length === 0) {
        return { success: true, output: "No references found." };
      }
      
      const formatted = refs.map(d => `${d.uri.replace("file://", "")}:${d.range.start.line + 1}:${d.range.start.character + 1}`).join("\n");
      return { success: true, output: `Found references:\n${formatted}` };
      
    } else if (args.action === "diagnostics") {
      // For diagnostics, we'd typically need to listen to notifications and store them.
      // Since this is a simple stateless tool for now, we'll return a placeholder.
      return { 
        success: true, 
        output: "Diagnostics are currently collected asynchronously in the background. (Placeholder for Phase 10)" 
      };
    }

    return { success: false, output: "", error: "Invalid action" };
  } catch (e) {
    return {
      success: false,
      output: "",
      error: `LSP query failed: ${(e as Error).message}`,
    };
  }
}

// ── Tool Definition ───────────────────────────────────────

export const lspQueryTool: ToolDefinition<typeof LspQueryParams> = {
  name: "lsp_query",
  description: "Query the active Language Server (LSP) for definitions, references, or diagnostics.",
  longDescription:
    "Communicates with a background Language Server (e.g., tsserver, rust-analyzer) to " +
    "provide accurate code intelligence. Can find definitions and references for a given " +
    "symbol position.",
  parameters: LspQueryParams,
  category: "agent",
  isConcurrencySafe: false, // Don't overwhelm the LSP
  isReadOnly: true,
  execute,
};
