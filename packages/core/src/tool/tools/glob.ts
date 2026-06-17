// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — glob Tool
// ═══════════════════════════════════════════════════════════
//
// Finds files matching a glob pattern. Useful for discovering
// project structure and finding relevant files.

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const GlobParams = z.object({
  pattern: z.string().describe("Glob pattern to match (e.g., 'src/**/*.ts', '*.json', '**/*.test.*')"),
  cwd: z.string().optional().describe("Base directory (defaults to session CWD)"),
  maxResults: z.number().default(100).describe("Maximum number of files to return"),
});

type GlobArgs = z.infer<typeof GlobParams>;

// ── Constants ─────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".quandcode",
  "target", "__pycache__", ".next", ".nuxt", "coverage",
  ".turbo", ".cache", ".venv", "venv",
]);

// ── Glob Matching ─────────────────────────────────────────

/**
 * Convert a simple glob pattern to a regex.
 * Supports: *, **, ?, {a,b}
 */
function globToRegex(pattern: string): RegExp {
  let regexStr = "^";
  let i = 0;

  while (i < pattern.length) {
    const char = pattern[i];

    if (char === "*") {
      if (pattern[i + 1] === "*") {
        // ** matches any depth
        if (pattern[i + 2] === "/" || pattern[i + 2] === "\\") {
          regexStr += "(?:.+[\\/])?";
          i += 3;
        } else {
          regexStr += ".*";
          i += 2;
        }
      } else {
        // * matches anything except path separators
        regexStr += "[^\\/]*";
        i++;
      }
    } else if (char === "?") {
      regexStr += "[^\\/]";
      i++;
    } else if (char === "{") {
      // Brace expansion
      const closing = pattern.indexOf("}", i);
      if (closing !== -1) {
        const alternatives = pattern.substring(i + 1, closing).split(",");
        regexStr += "(?:" + alternatives.map(a => a.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")";
        i = closing + 1;
      } else {
        regexStr += "\\{";
        i++;
      }
    } else if (char === "." || char === "(" || char === ")" || char === "[" || char === "]" || char === "+" || char === "^" || char === "$" || char === "|") {
      regexStr += "\\" + char;
      i++;
    } else if (char === "\\" || char === "/") {
      regexStr += "[\\/]";
      i++;
    } else {
      regexStr += char;
      i++;
    }
  }

  regexStr += "$";
  return new RegExp(regexStr, "i");
}

// ── Implementation ────────────────────────────────────────

function collectFiles(
  dirPath: string,
  basePath: string,
  regex: RegExp,
  results: string[],
  maxResults: number
): void {
  if (results.length >= maxResults) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  // Sort for consistent output
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (results.length >= maxResults) return;

    const fullPath = path.join(dirPath, entry.name);
    const relPath = path.relative(basePath, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".")) {
        collectFiles(fullPath, basePath, regex, results, maxResults);
      }
    } else if (entry.isFile()) {
      if (regex.test(relPath)) {
        results.push(relPath);
      }
    }
  }
}

async function execute(args: GlobArgs, context: ToolContext): Promise<ToolResult> {
  const basePath = args.cwd
    ? path.isAbsolute(args.cwd) ? args.cwd : path.resolve(context.cwd, args.cwd)
    : context.cwd;

  if (!fs.existsSync(basePath)) {
    return {
      success: false,
      output: "",
      error: `Directory not found: ${basePath}`,
    };
  }

  const regex = globToRegex(args.pattern);
  const results: string[] = [];

  collectFiles(basePath, basePath, regex, results, args.maxResults);

  if (results.length === 0) {
    return {
      success: true,
      output: `No files matching "${args.pattern}" in ${basePath}`,
      data: { fileCount: 0, files: [] },
    };
  }

  const truncated = results.length >= args.maxResults
    ? `\n\n(Results capped at ${args.maxResults} files)`
    : "";

  const output = `Found ${results.length} file${results.length > 1 ? "s" : ""} matching "${args.pattern}":\n\n${results.join("\n")}${truncated}`;

  return {
    success: true,
    output,
    data: { fileCount: results.length, files: results },
  };
}

// ── Tool Definition ───────────────────────────────────────

export const globTool: ToolDefinition<typeof GlobParams> = {
  name: "glob",
  description: "Find files matching a glob pattern. Useful for discovering project structure.",
  longDescription:
    "Searches for files matching a glob pattern (e.g., 'src/**/*.ts'). " +
    "Supports: * (any name), ** (any depth), ? (single char), {a,b} (alternatives). " +
    "Skips node_modules, .git, and other non-source directories. " +
    "Returns relative file paths.",
  parameters: GlobParams,
  category: "filesystem",
  isConcurrencySafe: true,
  isReadOnly: true,
  execute,
};
