// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode TUI — Cyberpunk Theme System
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";

// ── Color Palette ─────────────────────────────────────────

export const CYBER = {
  // Primary neon colors
  neonCyan:    chalk.hex("#00FFFF"),
  neonMagenta: chalk.hex("#FF00FF"),
  neonGreen:   chalk.hex("#39FF14"),
  neonYellow:  chalk.hex("#FFE600"),
  neonOrange:  chalk.hex("#FF6B00"),
  neonRed:     chalk.hex("#FF073A"),
  neonPink:    chalk.hex("#FF69B4"),
  neonBlue:    chalk.hex("#00A3FF"),

  // Dim variants
  dimCyan:     chalk.hex("#007A7A"),
  dimMagenta:  chalk.hex("#8B008B"),
  dimGreen:    chalk.hex("#1A8A0A"),
  dimYellow:   chalk.hex("#8B7500"),
  dimBlue:     chalk.hex("#004F7A"),

  // Surface colors
  bg:          chalk.bgHex("#0D0D1A"),
  bgAlt:       chalk.bgHex("#1A1A2E"),
  bgHighlight: chalk.bgHex("#16213E"),

  // Text
  text:        chalk.hex("#E0E0E0"),
  textDim:     chalk.hex("#6B6B7B"),
  textBright:  chalk.hex("#FFFFFF"),

  // Status
  success:     chalk.hex("#39FF14"),
  warning:     chalk.hex("#FFE600"),
  error:       chalk.hex("#FF073A"),
  info:        chalk.hex("#00A3FF"),
};

// ── ASCII Art & Decorations ───────────────────────────────

const Q1 = chalk.white("█▀█"), Q2 = chalk.white("█▄█");
const U1 = chalk.gray("█ █"), U2 = chalk.gray("█▄█");
const A1 = chalk.white("█▀█"), A2 = chalk.white("█▀█");
const N1 = chalk.gray("█▄ █"), N2 = chalk.gray("█ ▀█");
const D1 = chalk.white("█▀▄"), D2 = chalk.white("█▄▀");
const C1 = chalk.gray("█▀▀"), C2 = chalk.gray("█▄▄");
const O1 = chalk.white("█▀█"), O2 = chalk.white("█▄█");
const D_1 = chalk.gray("█▀▄"), D_2 = chalk.gray("█▄▀");
const E1 = chalk.white("█▀▀"), E2 = chalk.white("██▄");

export const BANNER = `
${CYBER.neonCyan("╔══════════════════════════════════════════════════════════╗")}
${CYBER.neonCyan("║")}  ${Q1} ${U1} ${A1} ${N1} ${D1} ${C1} ${O1} ${D_1} ${E1}  ${CYBER.neonCyan("║")}
${CYBER.neonCyan("║")}  ${Q2} ${U2} ${A2} ${N2} ${D2} ${C2} ${O2} ${D_2} ${E2}  ${CYBER.neonCyan("║")}
${CYBER.neonCyan("║")}                                                          ${CYBER.neonCyan("║")}
${CYBER.neonCyan("║")}  ${CYBER.dimCyan("⚡")} ${CYBER.text("The AI Coding Agent")} ${CYBER.dimCyan("·")} ${CYBER.textDim("v0.1.0")} ${CYBER.dimCyan("·")} ${CYBER.textDim("TypeScript + Rust")}     ${CYBER.neonCyan("║")}
${CYBER.neonCyan("╚══════════════════════════════════════════════════════════╝")}`;

export const DIVIDER = CYBER.dimCyan("─".repeat(60));
export const DIVIDER_BOLD = CYBER.neonCyan("═".repeat(60));

// ── Spinner Frames ────────────────────────────────────────

export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
export const CYBER_SPINNER = ["◐", "◓", "◑", "◒"];
export const GLITCH_SPINNER = ["▓", "▒", "░", "▒"];
export const MATRIX_SPINNER = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

// ── Formatters ────────────────────────────────────────────

export function formatToolName(name: string): string {
  const icons: Record<string, string> = {
    file_read:  "📖",
    file_write: "📝",
    file_edit:  "✏️ ",
    bash:       "💻",
    grep:       "🔍",
    glob:       "📁",
    list_dir:   "📂",
    plan_enter: "🧠",
    plan_exit:  "🔨",
    lsp_query:  "🔬",
  };
  const icon = icons[name] || "⚙️ ";
  return `${icon} ${CYBER.neonCyan(name)}`;
}

export function formatAgentMode(mode: "build" | "plan"): string {
  if (mode === "build") {
    return `${chalk.white("▶")} ${chalk.bgWhite.black(" BUILD ")}`;
  }
  return `${chalk.gray("◆")} ${chalk.bgHex("#333333").white(" PLAN ")}`;
}

export function formatTokens(input: number, output: number): string {
  return `${CYBER.dimCyan("tokens:")} ${CYBER.neonCyan(input.toLocaleString())}↓ ${CYBER.neonMagenta(output.toLocaleString())}↑`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function formatCost(microdollars: number): string {
  const dollars = microdollars / 1_000_000;
  return `$${dollars.toFixed(4)}`;
}

// ── Box Drawing ───────────────────────────────────────────

export function cyberBox(title: string, content: string, color = CYBER.neonCyan): string {
  const lines = content.split("\n");
  const maxLen = Math.max(title.length, ...lines.map(l => stripAnsi(l).length));
  const width = Math.min(maxLen + 4, 70);

  const top = color(`╭${"─".repeat(width)}╮`);
  const titleLine = color("│") + ` ${CYBER.textBright.bold(title)}${" ".repeat(Math.max(0, width - title.length - 1))}` + color("│");
  const sep = color(`├${"─".repeat(width)}┤`);
  const body = lines.map(l => {
    const stripped = stripAnsi(l);
    const pad = Math.max(0, width - stripped.length - 1);
    return color("│") + ` ${l}${" ".repeat(pad)}` + color("│");
  }).join("\n");
  const bottom = color(`╰${"─".repeat(width)}╯`);

  return `${top}\n${titleLine}\n${sep}\n${body}\n${bottom}`;
}

// ── Helpers ───────────────────────────────────────────────

function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function truncate(str: string, max: number): string {
  const stripped = stripAnsi(str);
  if (stripped.length <= max) return str;
  return str.substring(0, max - 3) + CYBER.textDim("...");
}
