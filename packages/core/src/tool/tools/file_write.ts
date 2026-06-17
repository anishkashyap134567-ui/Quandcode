// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — file_write Tool
// ═══════════════════════════════════════════════════════════
//
// Creates new files or overwrites existing ones.
// Auto-creates parent directories if needed.

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const FileWriteParams = z.object({
  path: z.string().describe("Absolute or relative path to the file to create/write"),
  content: z.string().describe("The full content to write to the file"),
  overwrite: z.boolean().default(false).describe("If true, overwrite existing files. If false, fail if file exists."),
});

type FileWriteArgs = z.infer<typeof FileWriteParams>;

// ── Implementation ────────────────────────────────────────

async function execute(args: FileWriteArgs, context: ToolContext): Promise<ToolResult> {
  const filePath = path.isAbsolute(args.path)
    ? args.path
    : path.resolve(context.cwd, args.path);

  // Check if file exists and overwrite is false
  if (fs.existsSync(filePath) && !args.overwrite) {
    return {
      success: false,
      output: "",
      error: `File already exists: ${filePath}. Set overwrite=true to replace it.`,
    };
  }

  // Create parent directories
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write file
  const isNew = !fs.existsSync(filePath);
  fs.writeFileSync(filePath, args.content, "utf-8");

  const lineCount = args.content.split("\n").length;
  const byteCount = Buffer.byteLength(args.content, "utf-8");

  const action = isNew ? "Created" : "Wrote";
  const output = `${action}: ${filePath} (${lineCount} lines, ${byteCount} bytes)`;

  return {
    success: true,
    output,
    data: {
      path: filePath,
      isNew,
      lineCount,
      byteCount,
    },
  };
}

// ── Tool Definition ───────────────────────────────────────

export const fileWriteTool: ToolDefinition<typeof FileWriteParams> = {
  name: "file_write",
  description: "Create a new file or overwrite an existing one with the provided content.",
  longDescription:
    "Writes content to a file. Creates parent directories automatically. " +
    "By default, refuses to overwrite existing files (set overwrite=true to force). " +
    "Prefer file_edit for modifying existing files — it's safer and more precise.",
  parameters: FileWriteParams,
  category: "filesystem",
  isConcurrencySafe: false,
  isReadOnly: false,
  execute,
};
