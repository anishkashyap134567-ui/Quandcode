// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — file_read Tool
// ═══════════════════════════════════════════════════════════
//
// Reads file contents with optional line range selection.
// Supports: text files, line ranges, file size limits.

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const FileReadParams = z.object({
  path: z.string().describe("Absolute or relative path to the file to read"),
  startLine: z.number().int().min(1).optional().describe("Start line (1-indexed, inclusive)"),
  endLine: z.number().int().min(1).optional().describe("End line (1-indexed, inclusive)"),
});

type FileReadArgs = z.infer<typeof FileReadParams>;

// ── Constants ─────────────────────────────────────────────

const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2 MB
const MAX_LINES_DEFAULT = 500;

// ── Implementation ────────────────────────────────────────

async function execute(args: FileReadArgs, context: ToolContext): Promise<ToolResult> {
  const filePath = path.isAbsolute(args.path)
    ? args.path
    : path.resolve(context.cwd, args.path);

  // Check file exists
  if (!fs.existsSync(filePath)) {
    return {
      success: false,
      output: "",
      error: `File not found: ${filePath}`,
    };
  }

  // Check file size
  const stats = fs.statSync(filePath);
  if (!stats.isFile()) {
    return {
      success: false,
      output: "",
      error: `Not a file: ${filePath} (is a ${stats.isDirectory() ? "directory" : "other"})`,
    };
  }

  if (stats.size > MAX_FILE_SIZE) {
    return {
      success: false,
      output: "",
      error: `File too large: ${filePath} (${(stats.size / 1024 / 1024).toFixed(1)} MB, max ${MAX_FILE_SIZE / 1024 / 1024} MB). Use line ranges to read portions.`,
    };
  }

  // Read file
  const content = fs.readFileSync(filePath, "utf-8");
  const allLines = content.split("\n");
  const totalLines = allLines.length;

  // Apply line range
  let startLine = args.startLine || 1;
  let endLine = args.endLine || Math.min(totalLines, startLine + MAX_LINES_DEFAULT - 1);

  // Clamp
  startLine = Math.max(1, Math.min(startLine, totalLines));
  endLine = Math.max(startLine, Math.min(endLine, totalLines));

  const selectedLines = allLines.slice(startLine - 1, endLine);

  // Format with line numbers
  const numbered = selectedLines
    .map((line, i) => `${(startLine + i).toString().padStart(4)}: ${line}`)
    .join("\n");

  // Build header
  const rangeInfo =
    startLine === 1 && endLine === totalLines
      ? `(${totalLines} lines)`
      : `(lines ${startLine}-${endLine} of ${totalLines})`;

  const output = `File: ${filePath} ${rangeInfo}\n${"─".repeat(60)}\n${numbered}`;

  return {
    success: true,
    output,
    data: {
      path: filePath,
      totalLines,
      startLine,
      endLine,
      linesReturned: selectedLines.length,
    },
  };
}

// ── Tool Definition ───────────────────────────────────────

export const fileReadTool: ToolDefinition<typeof FileReadParams> = {
  name: "file_read",
  description: "Read the contents of a file. Supports optional line ranges for large files.",
  longDescription:
    "Reads a file and returns its contents with line numbers. " +
    "For large files, use startLine/endLine to read specific sections. " +
    `Max file size: ${MAX_FILE_SIZE / 1024 / 1024} MB. ` +
    `Returns up to ${MAX_LINES_DEFAULT} lines by default.`,
  parameters: FileReadParams,
  category: "filesystem",
  isConcurrencySafe: true,
  isReadOnly: true,
  execute,
};
