// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Core Tools Registry
// ═══════════════════════════════════════════════════════════
//
// Exports all 7 core tools and a helper to register them all.

import type { ToolDefinition } from "../types.js";
import type { ToolRegistry } from "../registry.js";
import { fileReadTool } from "./file_read.js";
import { fileWriteTool } from "./file_write.js";
import { fileEditTool } from "./file_edit.js";
import { bashTool } from "./bash.js";
import { grepTool } from "./grep.js";
import { globTool } from "./glob.js";
import { listDirTool } from "./list_dir.js";
import { planEnterTool } from "./plan_enter.js";
import { planExitTool } from "./plan_exit.js";
import { lspQueryTool } from "./lsp_query.js";

// Re-export individual tools
export { fileReadTool } from "./file_read.js";
export { fileWriteTool } from "./file_write.js";
export { fileEditTool } from "./file_edit.js";
export { bashTool } from "./bash.js";
export { grepTool } from "./grep.js";
export { globTool } from "./glob.js";
export { listDirTool } from "./list_dir.js";
export { planEnterTool } from "./plan_enter.js";
export { planExitTool } from "./plan_exit.js";
export { lspQueryTool } from "./lsp_query.js";

/**
 * All 10 core tools as an array.
 */
export const CORE_TOOLS: ToolDefinition<any>[] = [
  fileReadTool,
  fileWriteTool,
  fileEditTool,
  bashTool,
  grepTool,
  globTool,
  listDirTool,
  planEnterTool,
  planExitTool,
  lspQueryTool,
];

/**
 * Register all core tools into a ToolRegistry.
 */
export function registerCoreTools(registry: ToolRegistry): void {
  registry.registerAll(CORE_TOOLS);
}
