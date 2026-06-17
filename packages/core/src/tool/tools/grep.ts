// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — grep Tool
// ═══════════════════════════════════════════════════════════
//
// Searches for patterns across files using regex or literal.
// Returns matching lines with file paths and line numbers.

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const GrepParams = z.object({
  pattern: z.string().describe("Search pattern (regex or literal string)"),
  path: z.string().optional().describe("Directory or file to search (defaults to CWD)"),
  include: z.string().optional().describe("Glob pattern to filter files (e.g., '*.ts', '*.py')"),
  caseSensitive: z.boolean().default(true).describe("Case-sensitive search (default: true)"),
  maxResults: z.number().default(50).describe("Maximum number of matches to return"),
});

type GrepArgs = z.infer<typeof GrepParams>;

// ── Constants ─────────────────────────────────────────────

const BINARY_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".svg",
  ".woff", ".woff2", ".ttf", ".eot",
  ".zip", ".gz", ".tar", ".bz2",
  ".mp3", ".mp4", ".avi", ".mov",
  ".pdf", ".doc", ".docx",
  ".exe", ".dll", ".so", ".dylib",
  ".db", ".sqlite",
]);

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", ".quandcode",
  "target", "__pycache__", ".next", ".nuxt", "coverage",
  ".turbo", ".cache",
]);

// ── Implementation ────────────────────────────────────────

interface GrepMatch {
  file: string;
  line: number;
  content: string;
}

function searchFile(
  filePath: string,
  regex: RegExp,
  maxResults: number,
  matches: GrepMatch[],
  basePath: string
): void {
  if (matches.length >= maxResults) return;

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const relPath = path.relative(basePath, filePath);

    for (let i = 0; i < lines.length; i++) {
      if (matches.length >= maxResults) return;

      if (regex.test(lines[i])) {
        matches.push({
          file: relPath,
          line: i + 1,
          content: lines[i].trim().substring(0, 200),
        });
      }
      // Reset regex lastIndex for global flag
      regex.lastIndex = 0;
    }
  } catch {
    // Skip unreadable files silently
  }
}

function searchDirectory(
  dirPath: string,
  regex: RegExp,
  includeGlob: string | undefined,
  maxResults: number,
  matches: GrepMatch[],
  basePath: string
): void {
  if (matches.length >= maxResults) return;

  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (matches.length >= maxResults) return;

    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) {
        searchDirectory(fullPath, regex, includeGlob, maxResults, matches, basePath);
      }
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).toLowerCase();
      if (BINARY_EXTENSIONS.has(ext)) continue;

      // Check include glob (simple extension matching)
      if (includeGlob) {
        if (includeGlob.startsWith("*.")) {
          const requiredExt = includeGlob.substring(1);
          if (ext !== requiredExt) continue;
        } else if (includeGlob.startsWith("**/*.")) {
          const requiredExt = includeGlob.substring(3);
          if (ext !== requiredExt) continue;
        }
      }

      searchFile(fullPath, regex, maxResults, matches, basePath);
    }
  }
}

async function execute(args: GrepArgs, context: ToolContext): Promise<ToolResult> {
  const searchPath = args.path
    ? path.isAbsolute(args.path) ? args.path : path.resolve(context.cwd, args.path)
    : context.cwd;

  if (!fs.existsSync(searchPath)) {
    return {
      success: false,
      output: "",
      error: `Path not found: ${searchPath}`,
    };
  }

  // Build regex
  let regex: RegExp;
  try {
    const flags = args.caseSensitive ? "" : "i";
    regex = new RegExp(args.pattern, flags);
  } catch {
    // Fall back to literal search if regex is invalid
    const escaped = args.pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const flags = args.caseSensitive ? "" : "i";
    regex = new RegExp(escaped, flags);
  }

  const matches: GrepMatch[] = [];

  const stats = fs.statSync(searchPath);
  if (stats.isFile()) {
    searchFile(searchPath, regex, args.maxResults, matches, context.cwd);
  } else {
    searchDirectory(searchPath, regex, args.include, args.maxResults, matches, context.cwd);
  }

  if (matches.length === 0) {
    return {
      success: true,
      output: `No matches found for "${args.pattern}" in ${searchPath}`,
      data: { matchCount: 0 },
    };
  }

  // Format output
  const lines = matches.map(
    (m) => `${m.file}:${m.line}: ${m.content}`
  );

  const truncated = matches.length >= args.maxResults
    ? `\n\n(Results capped at ${args.maxResults} matches)`
    : "";

  const output = `Found ${matches.length} match${matches.length > 1 ? "es" : ""} for "${args.pattern}":\n\n${lines.join("\n")}${truncated}`;

  return {
    success: true,
    output,
    data: {
      matchCount: matches.length,
      matches,
    },
  };
}

// ── Tool Definition ───────────────────────────────────────

export const grepTool: ToolDefinition<typeof GrepParams> = {
  name: "grep",
  description: "Search for a pattern across files. Returns matching lines with file paths and line numbers.",
  longDescription:
    "Searches files for a regex or literal pattern. Skips binary files and common " +
    "non-source directories (node_modules, .git, dist). Use the 'include' parameter " +
    "to filter by file extension (e.g., '*.ts'). Case-sensitive by default.",
  parameters: GrepParams,
  category: "filesystem",
  isConcurrencySafe: true,
  isReadOnly: true,
  execute,
};
