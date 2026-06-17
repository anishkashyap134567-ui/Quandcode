// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — list_dir Tool
// ═══════════════════════════════════════════════════════════
//
// Lists directory contents with file sizes and types.
// Tree-style output for easy scanning.

import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import type { ToolDefinition, ToolResult, ToolContext } from "../types.js";

// ── Parameters Schema ─────────────────────────────────────

export const ListDirParams = z.object({
  path: z.string().default(".").describe("Directory path to list (defaults to CWD)"),
  recursive: z.boolean().default(false).describe("List recursively (tree view)"),
  maxDepth: z.number().default(3).describe("Max depth for recursive listing"),
});

type ListDirArgs = z.infer<typeof ListDirParams>;

// ── Constants ─────────────────────────────────────────────

const SKIP_DIRS = new Set([
  "node_modules", ".git", "dist", "build", "target",
  "__pycache__", ".next", ".nuxt", "coverage",
]);

// ── Implementation ────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}M`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}G`;
}

interface DirEntry {
  name: string;
  type: "file" | "dir";
  size?: number;
  children?: DirEntry[];
}

function listDir(dirPath: string, depth: number, maxDepth: number, recursive: boolean): DirEntry[] {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  // Sort: directories first, then files, alphabetically
  entries.sort((a, b) => {
    if (a.isDirectory() && !b.isDirectory()) return -1;
    if (!a.isDirectory() && b.isDirectory()) return 1;
    return a.name.localeCompare(b.name);
  });

  const result: DirEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".quandcode") continue;

    if (entry.isDirectory()) {
      const dirEntry: DirEntry = {
        name: entry.name + "/",
        type: "dir",
      };

      if (recursive && depth < maxDepth && !SKIP_DIRS.has(entry.name)) {
        dirEntry.children = listDir(
          path.join(dirPath, entry.name),
          depth + 1,
          maxDepth,
          recursive
        );
      }

      result.push(dirEntry);
    } else if (entry.isFile()) {
      const fullPath = path.join(dirPath, entry.name);
      let size = 0;
      try {
        size = fs.statSync(fullPath).size;
      } catch { /* ignore */ }

      result.push({
        name: entry.name,
        type: "file",
        size,
      });
    }
  }

  return result;
}

function formatTree(entries: DirEntry[], prefix: string = ""): string[] {
  const lines: string[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    if (entry.type === "dir") {
      lines.push(`${prefix}${connector}📁 ${entry.name}`);
      if (entry.children && entry.children.length > 0) {
        lines.push(...formatTree(entry.children, prefix + childPrefix));
      }
    } else {
      const sizeStr = entry.size !== undefined ? ` (${formatSize(entry.size)})` : "";
      lines.push(`${prefix}${connector}${entry.name}${sizeStr}`);
    }
  }

  return lines;
}

async function execute(args: ListDirArgs, context: ToolContext): Promise<ToolResult> {
  const dirPath = path.isAbsolute(args.path)
    ? args.path
    : path.resolve(context.cwd, args.path);

  if (!fs.existsSync(dirPath)) {
    return {
      success: false,
      output: "",
      error: `Directory not found: ${dirPath}`,
    };
  }

  const stats = fs.statSync(dirPath);
  if (!stats.isDirectory()) {
    return {
      success: false,
      output: "",
      error: `Not a directory: ${dirPath}`,
    };
  }

  const entries = listDir(dirPath, 0, args.maxDepth, args.recursive);
  const treeLines = formatTree(entries);

  const dirCount = entries.filter((e) => e.type === "dir").length;
  const fileCount = entries.filter((e) => e.type === "file").length;

  const header = `📁 ${dirPath}\n${"─".repeat(50)}`;
  const footer = `\n${dirCount} director${dirCount !== 1 ? "ies" : "y"}, ${fileCount} file${fileCount !== 1 ? "s" : ""}`;

  const output = `${header}\n${treeLines.join("\n")}${footer}`;

  return {
    success: true,
    output,
    data: {
      path: dirPath,
      dirCount,
      fileCount,
      entries,
    },
  };
}

// ── Tool Definition ───────────────────────────────────────

export const listDirTool: ToolDefinition<typeof ListDirParams> = {
  name: "list_dir",
  description: "List the contents of a directory with file sizes and types.",
  longDescription:
    "Shows directory contents in a tree format. Directories appear first, then files. " +
    "Use recursive=true for a tree view (up to maxDepth levels). " +
    "Skips node_modules, .git, dist, and hidden directories by default.",
  parameters: ListDirParams,
  category: "filesystem",
  isConcurrencySafe: true,
  isReadOnly: true,
  execute,
};
