import * as fs from 'fs';
import * as path from 'path';

// Output paths
const outputDir = path.join(__dirname, '../media');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
const outputPath = path.join(outputDir, 'tui_screenshot.svg');

// SVG Template
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" width="100%" height="100%">
  <!-- Window Background -->
  <rect width="800" height="520" rx="10" ry="10" fill="#0F172A" stroke="#1E293B" stroke-width="2"/>
  
  <!-- Window Header Bar -->
  <path d="M0,10 A10,10 0 0,1 10,0 L790,0 A10,10 0 0,1 800,10 L800,40 L0,40 Z" fill="#1E293B" />
  
  <!-- Window Controls -->
  <circle cx="25" cy="20" r="6" fill="#EF4444"/>
  <circle cx="45" cy="20" r="6" fill="#F59E0B"/>
  <circle cx="65" cy="20" r="6" fill="#10B981"/>
  
  <!-- Window Title -->
  <text x="400" y="24" fill="#94A3B8" font-family="Courier New, monospace" font-size="13" font-weight="bold" text-anchor="middle">quandcode — terminal</text>
  
  <!-- Terminal Content Area -->
  <g font-family="Courier New, monospace" font-size="14" xml:space="preserve">
    <!-- ASCII Art Banner -->
    <text x="50" y="70" fill="#06B6D4" font-weight="bold">╔══════════════════════════════════════════════════════════╗</text>
    <text x="50" y="88" fill="#06B6D4" font-weight="bold">║  <tspan fill="#F59E0B">█▀█ █ █ █▀█ █▄ █ █▀▄ █▀▀ █▀█ █▀▄ █▀▀</tspan>  ║</text>
    <text x="50" y="106" fill="#06B6D4" font-weight="bold">║  <tspan fill="#F59E0B">█▄█ █▄█ █▀█ █ ▀█ █▄▀ █▄▄ █▄█ █▄▀ ██▄</tspan>  ║</text>
    <text x="50" y="124" fill="#06B6D4" font-weight="bold">║                                                          ║</text>
    <text x="50" y="142" fill="#06B6D4" font-weight="bold">║  <tspan fill="#E2E8F0">⚡ The AI Coding Agent · v0.1.0 · TypeScript + Rust</tspan>     ║</text>
    <text x="50" y="160" fill="#06B6D4" font-weight="bold">╚══════════════════════════════════════════════════════════╝</text>
    
    <!-- Environment Info -->
    <text x="50" y="195" fill="#64748B">Model:    <tspan fill="#06B6D4">google/gemini-2.5-flash</tspan></text>
    <text x="50" y="215" fill="#64748B">Mode:     <tspan fill="#10B981" font-weight="bold">▶  BUILD</tspan></text>
    <text x="50" y="235" fill="#64748B">CWD:      <tspan fill="#94A3B8">C:\\Users\\Anish\\OneDrive\\Desktop</tspan></text>
    
    <text x="50" y="260" fill="#64748B">Type a prompt to begin, or <tspan fill="#06B6D4">/help</tspan> for commands.</text>
    
    <!-- Prompt input -->
    <text x="50" y="295" fill="#E2E8F0"><tspan fill="#10B981">▶  BUILD</tspan> <tspan fill="#06B6D4">›</tspan> <tspan font-weight="bold">make bash function</tspan></text>
    
    <!-- Session start output -->
    <text x="50" y="325" fill="#06B6D4">┌ <tspan fill="#64748B">Session: ses_01kvb1m0</tspan>  <tspan fill="#10B981">▶  BUILD</tspan></text>
    <text x="50" y="345" fill="#06B6D4">│</text>
    <text x="50" y="365" fill="#06B6D4">│ <tspan fill="#F59E0B">⚙ Tool Execution</tspan> <tspan fill="#64748B">(1 tool call)</tspan></text>
    <text x="50" y="385" fill="#06B6D4">│   <tspan fill="#06B6D4">💻 file_write</tspan> <tspan fill="#64748B">{"path":"scripts/helper.sh","content":"#!/bin..."}</tspan></text>
    
    <!-- Security Gate Prompt -->
    <text x="50" y="415" fill="#F59E0B">│ 🛡️ SECURITY GATE: <tspan fill="#E2E8F0">Allow tool "file_write"? (path: scripts/helper.sh)</tspan></text>
    <text x="50" y="435" fill="#F59E0B">│   Confirm (y/N) › <tspan fill="#FFFFFF" font-weight="bold">y</tspan></text>
    
    <!-- Tool Execution Completed -->
    <text x="50" y="455" fill="#06B6D4">│   <tspan fill="#10B981">✔</tspan> <tspan fill="#64748B">file_write → File scripts/helper.sh successfully written.</tspan></text>
  </g>
  
  <!-- Status Bar at the bottom -->
  <rect x="0" y="480" width="800" height="40" fill="#1E293B"/>
  <rect x="15" y="488" width="80" height="24" rx="3" fill="#FFFFFF"/>
  <text x="55" y="505" fill="#0F172A" font-family="Courier New, monospace" font-size="12" font-weight="bold" text-anchor="middle">▶  BUILD</text>
  
  <text x="110" y="505" fill="#06B6D4" font-family="Courier New, monospace" font-size="12" font-weight="bold">google/gemini-2.5-flash</text>
  
  <text x="785" y="505" fill="#94A3B8" font-family="Courier New, monospace" font-size="12" text-anchor="end">Tokens: <tspan fill="#FFFFFF">2.1k / 540</tspan> | <tspan fill="#10B981">12.4s</tspan></text>
</svg>`;

fs.writeFileSync(outputPath, svgContent, 'utf8');
console.log('Real TUI screenshot generated successfully at:', outputPath);
