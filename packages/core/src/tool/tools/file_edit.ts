// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — file_edit Tool
// ═══════════════════════════════════════════════════════════
//
// Surgical string-replacement edits. This is the preferred
// way to modify existing files — safer and more precise
// than rewriting the entire file.
//
// The LLM specifies an exact string to find (oldText) and
// what to replace it with (newText). Whitespace-sensitive.

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const FileEditParams = z.object({
  path: z.string().describe("Absolute or relative path to the file to edit"),
  oldText: z.string().describe("The exact text to find and replace (whitespace-sensitive)"),
  newText: z.string().describe("The replacement text"),
  replaceAll: z.boolean().default(false).describe("If true, replace all occurrences. If false, replace only the first."),
});

type FileEditArgs = z.infer<typeof FileEditParams>;

// ── Implementation ────────────────────────────────────────

async function execute(args: FileEditArgs, context: ToolContext): Promise<ToolResult> {
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

  // Read current content
  const original = fs.readFileSync(filePath, "utf-8");

  // Check if oldText exists in file
  const occurrences = original.split(args.oldText).length - 1;
  if (occurrences === 0) {
    // Try to help with debugging
    const trimmedSearch = args.oldText.trim();
    const fuzzyMatch = original.includes(trimmedSearch);

    let hint = "";
    if (fuzzyMatch) {
      hint = "\n\nHint: The text was found when ignoring leading/trailing whitespace. Check indentation and line endings.";
    }

    return {
      success: false,
      output: "",
      error: `Text not found in ${filePath}. The exact string to replace was not found.${hint}\n\nSearched for:\n${args.oldText.substring(0, 200)}${args.oldText.length > 200 ? "..." : ""}`,
    };
  }

  // Check for ambiguity
  if (occurrences > 1 && !args.replaceAll) {
    return {
      success: false,
      output: "",
      error: `Found ${occurrences} occurrences of the text in ${filePath}. Use replaceAll=true to replace all, or provide a more specific search text.`,
    };
  }

  // Perform replacement
  let modified: string;
  let replacementCount: number;

  if (args.replaceAll) {
    modified = original.split(args.oldText).join(args.newText);
    replacementCount = occurrences;
  } else {
    // Replace only the first occurrence
    const index = original.indexOf(args.oldText);
    modified = original.substring(0, index) + args.newText + original.substring(index + args.oldText.length);
    replacementCount = 1;
  }

  // Write modified content
  fs.writeFileSync(filePath, modified, "utf-8");

  // Generate a simple diff preview
  const oldLines = args.oldText.split("\n");
  const newLines = args.newText.split("\n");
  const diffPreview = [
    `--- ${filePath}`,
    `+++ ${filePath}`,
    ...oldLines.map((l) => `- ${l}`),
    ...newLines.map((l) => `+ ${l}`),
  ].join("\n");

  const output = `Edited: ${filePath} (${replacementCount} replacement${replacementCount > 1 ? "s" : ""})\n\n${diffPreview}`;

  return {
    success: true,
    output,
    data: {
      path: filePath,
      replacementCount,
      oldTextLength: args.oldText.length,
      newTextLength: args.newText.length,
    },
  };
}

// ── Tool Definition ───────────────────────────────────────

export const fileEditTool: ToolDefinition<typeof FileEditParams> = {
  name: "file_edit",
  description: "Make a targeted edit to an existing file by replacing an exact string match.",
  longDescription:
    "Performs a surgical find-and-replace in a file. You must provide the exact text to find (oldText) " +
    "and the replacement text (newText). Whitespace and indentation must match exactly. " +
    "If multiple occurrences exist, use replaceAll=true or provide more context in oldText to be unique. " +
    "This is preferred over file_write for modifying existing files.",
  parameters: FileEditParams,
  category: "filesystem",
  isConcurrencySafe: false,
  isReadOnly: false,
  execute,
};
