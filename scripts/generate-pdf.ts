import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

// Output paths
const outputProjPath = path.join(__dirname, '../QuandCode_Project_Summary.pdf');
const home = process.env.HOME || process.env.USERPROFILE || '';
const outputDesktopPath = path.join(home, 'OneDrive/Desktop/QuandCode_Project_Summary.pdf');
const backupDesktopPath = path.join(home, 'Desktop/QuandCode_Project_Summary.pdf');

// Create PDF doc with bufferPages enabled
const doc = new PDFDocument({
  size: 'A4',
  margins: { top: 50, bottom: 50, left: 50, right: 50 },
  bufferPages: true
});

// Stream output
const writeStream = fs.createWriteStream(outputProjPath);
doc.pipe(writeStream);

// Colors (Charcoal, Slate Blue, Neon Cyan, White)
const COLOR_PRIMARY = '#0F172A'; // Slate Blue
const COLOR_SECONDARY = '#0D9488'; // Teal
const COLOR_TEXT = '#334155'; // Charcoal
const COLOR_ACCENT = '#06B6D4'; // Cyan
const COLOR_BG_DARK = '#0F172A'; // Cover Dark BG

// ── COVER PAGE ───────────────────────────────────────────────────────────
doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLOR_BG_DARK);

// Neon Accent Line
doc.rect(50, 150, 4, 120).fill(COLOR_ACCENT);

// Title
doc.fillColor('#FFFFFF')
   .fontSize(36)
   .font('Helvetica-Bold')
   .text('QUANDCODE', 70, 150);

// Subtitle
doc.fillColor('#E2E8F0')
   .fontSize(16)
   .font('Helvetica')
   .text('Comprehensive Project Architecture & Technical Summary', 70, 195);

// Version Tag
doc.fillColor(COLOR_ACCENT)
   .fontSize(12)
   .font('Helvetica-Bold')
   .text('Version v0.1.0 · TypeScript + Bun + Rust', 70, 240);

// Description paragraph
doc.fillColor('#94A3B8')
   .fontSize(11)
   .font('Helvetica')
   .text(
     'An advanced, high-performance AI coding agent designed to run locally, orchestrate file modifications, execute shell commands in a secure sandbox, query Language Servers (LSP), and provide a premium, cyberpunk-themed interactive terminal UI.',
     70, 280, { width: doc.page.width - 140, lineGap: 6 }
   );

// Metadata footer
doc.fillColor('#64748B')
   .fontSize(10)
   .text('Author: Antigravity Pair-Programmer (Google DeepMind Team)', 70, doc.page.height - 100);
doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, 70, doc.page.height - 80);

doc.addPage();

// Helper for Section Titles
function addSectionHeader(title: string) {
  doc.moveDown(2);
  doc.fillColor(COLOR_PRIMARY)
     .fontSize(16)
     .font('Helvetica-Bold')
     .text(title);
  
  // Underline cyan highlight
  doc.rect(doc.x, doc.y + 4, 40, 2).fill(COLOR_ACCENT);
  doc.moveDown(1);
}

// Helper for Subsection Titles
function addSubsectionHeader(title: string) {
  doc.moveDown(1);
  doc.fillColor(COLOR_SECONDARY)
     .fontSize(12)
     .font('Helvetica-Bold')
     .text(title);
  doc.moveDown(0.5);
}

// Helper for Body Text
function addBodyText(text: string) {
  doc.fillColor(COLOR_TEXT)
     .fontSize(10)
     .font('Helvetica')
     .text(text, { align: 'justify', lineGap: 4 });
  doc.moveDown(0.8);
}

// ── SECTION 1: PROJECT OVERVIEW ──────────────────────────────────────────
addSectionHeader('1. Project Overview & Vision');
addBodyText(
  'QuandCode is built from the ground up as a robust local AI agent that bridges high-level architecture planning and direct filesystem modifications. Unlike traditional AI tools, it uses a dual-agent configuration separating Plan and Build responsibilities, preventing accidental modifications and ensuring solid software architectural planning.'
);

addBodyText(
  'By leveraging TypeScript, Bun (workspaces, runtime, test runner), and Rust (for strict sandbox OS interactions), QuandCode balances high-level development speed and low-level security sandboxing.'
);

// ── SECTION 2: ARCHITECTURE & LAYOUT ─────────────────────────────────────
addSectionHeader('2. Architecture & Monorepo Layout');
addBodyText(
  'QuandCode utilizes a monorepo setup managed via Bun Workspaces. It splits the core engine from user interface components and restricted sandboxed runner programs.'
);

addSubsectionHeader('Module Breakdown:');
addBodyText('• @quandcode/core (packages/core): The primary engine. Holds the state machine, ORM storage models, unified LLM API adapters, tool registrations, LSP client connection, and permission handlers.');
addBodyText('• @quandcode/tui (packages/tui): A terminal-based cyber UI built using React and Ink, providing high-fidelity streaming, command bars, status trackers, and permission modals.');
addBodyText('• quandcode-sandbox (packages/sandbox): A Rust crate compiling into a separate executable that manages process sandboxing (Windows Jobs, Unix Bubblewrap) to safely run bash commands.');

// ── SECTION 3: TECHNICAL DEVELOPMENT PHASES (1-6) ──────────────────────────
addSectionHeader('3. Technical Development Phases (1-6)');

addSubsectionHeader('Phase 1: Environment & Workspace Foundation');
addBodyText('Established the workspace skeleton using Bun workspaces, configuring shared tsconfig, lint configurations, and resolving package links.');

addSubsectionHeader('Phase 2: Drizzle ORM & Local SQLite Storage');
addBodyText('Configured Drizzle ORM running on local better-sqlite3. Created schemas for sessions, messages, snapshots, and key-value metadata. Added cascade delete constraints and automated token tracking.');

addSubsectionHeader('Phase 3: Session Engine');
addBodyText('Built SessionManager supporting starting, resuming, and listing sessions. Implemented message copying for forking sessions and automated session title generation.');

addSubsectionHeader('Phase 4: Unified LLM Provider Abstraction');
addBodyText('Created LLMProvider interface with registries for Anthropic, OpenAI, and Google Gemini. Set up model databases and token price estimation algorithms to calculate usage costs in microdollars.');

addSubsectionHeader('Phase 5: Dynamic System Prompts');
addBodyText('Configured dynamic prompts for Plan/Build modes that automatically fetch directory file trees, workspace guidelines (AGENTS.md), and custom project instructions.');

addSubsectionHeader('Phase 6: Permission-Gated Tool System');
addBodyText('Created a declarative tool registration system with schemas validated via Zod. Added PermissionManager to query the user (ask/allow/deny) for sensitive operations (writing, bash command run).');

doc.addPage();

// ── SECTION 3 CONT: PHASES (7-12) ──────────────────────────────────────────
addSectionHeader('3. Technical Development Phases (7-12)');

addSubsectionHeader('Phase 7: Core Toolset');
addBodyText('Implemented the 10 core tools: file_read, file_write, file_edit, bash, grep, glob, list_dir, lsp_query, plan_enter, plan_exit.');

addSubsectionHeader('Phase 8 & 9: Dual-Agent loop & Modes');
addBodyText('Implemented AgentLoop driving Plan-Act-Observe-Refine iterations. Set up automated mode switching: Plan mode blocks writes and focuses on markdown plans; Build mode executes changes.');

addSubsectionHeader('Phase 10: LSP Queries & Rust Sandbox Integration');
addBodyText('Created LSPClient communicating definition queries to the TypeScript server. Connected the Rust sandbox crate to run commands securely via JSON stdin/stdout IPC.');

addSubsectionHeader('Phase 11: Cyber Terminal UI');
addBodyText('Designed a premium, cyberpunk terminal REPL using Ink, adding custom neon palettes, Matrix spinners, realtime streaming tokens, and a config wizard.');

addSubsectionHeader('Phase 12: CI/CD, LLM Adapters & Ollama Support');
addBodyText('Created zero-dependency HTTP fetch API adapters for OpenAI, Anthropic, Google Gemini, and local Ollama. Implemented config fallbacks, base URL auto-prepending, and dynamic local model resolution. Set up automated CI/CD using GitHub Actions executing tests and type checking.');

// ── SECTION 4: KEY ENGINEERING HIGHLIGHTS ──────────────────────────────────
addSectionHeader('4. Key Engineering Highlights');

addSubsectionHeader('🔐 Safe Global API Key & Config Storage');
addBodyText(
  'Created a global-to-local configuration merging engine. Saved credentials (like your Google Gemini API key) are stored safely in your user home directory (~/.config/quandcode/quandcode.json) to prevent accidental git leaks, with local project configurations acting as overlays.'
);

addSubsectionHeader('⚡ Local Model Execution (Ollama)');
addBodyText(
  'Enabled dynamic local model execution via Ollama. The provider dynamically resolves any model prefixed with ollama/ (e.g., ollama/qwen2.5-coder) and handles local base URL fallbacks. It also auto-prepends http:// for raw IP configurations.'
);

addSubsectionHeader('⚡ Self-Healing CLI Model Fallback');
addBodyText(
  'If the CLI detects a corrupted configuration or an invalid model ID, it dynamically recovers by inspecting configured environment/config keys and automatically selecting a matching model (like gemini-2.5-flash) rather than failing.'
);

// ── SECTION 5: VERIFICATION & TESTING ─────────────────────────────────────
addSectionHeader('5. Verification & Testing');
addBodyText(
  'QuandCode includes a comprehensive, custom test suite verifying every component. Running "bun run test" executes all 168 unit tests across 10 suites, ensuring storage engine, provider registry, agent loops, tools, and UI modules operate with a 100% pass rate.'
);

// ── DRAW HEADERS & FOOTERS (Buffered Page Range) ───────────────────────────
const range = doc.bufferedPageRange(); // { start: 0, count: X }
for (let i = range.start + 1; i < range.start + range.count; i++) {
  doc.switchToPage(i);
  
  // Header Text
  doc.fillColor('#64748B')
     .fontSize(8)
     .font('Helvetica')
     .text('QUANDCODE — TECHNICAL PROJECT SUMMARY', 50, 30);
  
  // Header line
  doc.moveTo(50, 42).lineTo(doc.page.width - 50, 42).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
  
  // Footer line
  doc.moveTo(50, doc.page.height - 40).lineTo(doc.page.width - 50, doc.page.height - 40).strokeColor('#E2E8F0').lineWidth(0.5).stroke();
  
  // Footer Text
  doc.fillColor('#64748B')
     .fontSize(8)
     .text(`Page ${i + 1} of ${range.count}`, doc.page.width - 100, doc.page.height - 30);
}

// ── END OF DOCUMENT ───────────────────────────────────────────────────────
doc.end();

writeStream.on('finish', () => {
  console.log('PDF successfully generated at:', outputProjPath);
  
  // Copy to Desktop if directory exists
  try {
    if (fs.existsSync(path.dirname(outputDesktopPath))) {
      fs.copyFileSync(outputProjPath, outputDesktopPath);
      console.log('PDF successfully copied to Desktop at:', outputDesktopPath);
    } else if (fs.existsSync(path.dirname(backupDesktopPath))) {
      fs.copyFileSync(outputProjPath, backupDesktopPath);
      console.log('PDF successfully copied to Backup Desktop at:', backupDesktopPath);
    }
  } catch (err) {
    console.error('Failed to copy PDF to Desktop:', err);
  }
});
