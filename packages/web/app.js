// Quandcode Terminal Simulator
const terminalBody = document.getElementById('terminal-body');
const terminalHistory = document.getElementById('terminal-history');
const terminalInput = document.getElementById('terminal-input');
const modeLabel = document.getElementById('terminal-mode-label');

let currentMode = 'build'; // 'build' or 'plan'
let activeProvider = 'google';
let activeModel = 'gemini-2.5-flash';

// State machine for terminal interactions
// States: 'idle', 'wizard_provider', 'wizard_model', 'guard_approve'
let terminalState = 'idle';
let wizardData = {};
let guardCallback = null;

// Helper to get styled Mode label HTML
function getModeLabelHTML(mode) {
  if (mode === 'build') {
    return `<span class="ansi-mode-label"><span class="arrow ansi-white">▶</span> <span class="badge-build">BUILD</span></span>`;
  }
  if (mode === 'plan') {
    return `<span class="ansi-mode-label"><span class="arrow ansi-gray">◆</span> <span class="badge-plan">PLAN</span></span>`;
  }
  if (mode === 'config') {
    return `<span class="ansi-mode-label"><span class="arrow ansi-white">⚙</span> <span class="badge-plan" style="background-color: #888888; color: #0c0c0c;">CONFIG</span></span>`;
  }
  if (mode === 'guard') {
    return `<span class="ansi-mode-label"><span class="arrow ansi-white">🛡️</span> <span class="badge-plan" style="background-color: #ffffff; color: #0c0c0c; font-weight: bold;">GUARD</span></span>`;
  }
  return '';
}

// Update input line mode label
function updateInputModeLabel(mode) {
  modeLabel.innerHTML = getModeLabelHTML(mode);
}

// Helper to append a styled line to the terminal history
function printLine(htmlContent, className = 'terminal-log-line') {
  const line = document.createElement('div');
  line.className = className;
  line.innerHTML = htmlContent;
  terminalHistory.appendChild(line);
  terminalBody.scrollTop = terminalBody.scrollHeight;
}

// Stream simulated typewriter output line by line
async function printLinesAnimated(lines, delayMs = 150) {
  terminalInput.disabled = true;
  for (const line of lines) {
    printLine(line);
    await new Promise(resolve => setTimeout(resolve, delayMs));
  }
  terminalInput.disabled = false;
  terminalInput.focus();
}

// Clear terminal output
function clearTerminal() {
  terminalHistory.innerHTML = '';
}

// Handle inputs
terminalInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const value = terminalInput.value.trim();
    terminalInput.value = '';
    
    if (!value) return;

    // Log user command with current active label
    const userLabel = terminalState === 'idle' ? currentMode : terminalState === 'wizard_provider' || terminalState === 'wizard_model' ? 'config' : 'guard';
    printLine(`${getModeLabelHTML(userLabel)} <span class="ansi-cyan-bright">›</span> <span class="ansi-white">${escapeHtml(value)}</span>`, 'terminal-user-entry');

    // Route based on state
    if (terminalState === 'wizard_provider') {
      handleWizardProvider(value);
    } else if (terminalState === 'wizard_model') {
      handleWizardModel(value);
    } else if (terminalState === 'guard_approve') {
      handleGuardApproval(value);
    } else {
      await handleDefaultCommand(value);
    }
  }
});

// Standard command handler
async function handleDefaultCommand(value) {
  const lowercaseVal = value.toLowerCase();
  
  if (lowercaseVal === 'clear') {
    clearTerminal();
    return;
  }
  
  if (lowercaseVal === '/help') {
    await printLinesAnimated([
      `<span class="ansi-cyan-bright">Available Commands:</span>`,
      `  <span class="ansi-yellow">/help</span>          Show this help interface`,
      `  <span class="ansi-yellow">/build</span>         Switch mode to BUILD`,
      `  <span class="ansi-yellow">/plan</span>          Switch mode to PLAN`,
      `  <span class="ansi-yellow">/sessions</span>      List active or saved workspace sessions`,
      `  <span class="ansi-yellow">/config</span>        Initialize an interactive configuration wizard`,
      `  <span class="ansi-yellow">clear</span>          Clear the terminal window`,
      `  <span class="ansi-yellow">run &lt;prompt&gt;</span>  Trigger the agent loop (e.g. <span class="ansi-gray">run "make a game"</span>)`
    ], 60);
    return;
  }

  if (lowercaseVal === '/build') {
    currentMode = 'build';
    updateInputModeLabel('build');
    printLine(`Switched to <span class="ansi-white">▶</span> <span class="badge-build">BUILD</span> mode`);
    return;
  }

  if (lowercaseVal === '/plan') {
    currentMode = 'plan';
    updateInputModeLabel('plan');
    printLine(`Switched to <span class="ansi-gray">◆</span> <span class="badge-plan">PLAN</span> mode`);
    return;
  }
  
  if (lowercaseVal === '/sessions') {
    await printLinesAnimated([
      `<span class="ansi-cyan-bright">┌── Previous Sessions ──────────────────────────────</span>`,
      `│  <span class="ansi-cyan">ea81b0</span>… : <span class="ansi-white">implement dashboard UI</span> <span class="ansi-green-bright"> ● (active)</span>`,
      `│    <span class="ansi-gray">Model:</span> google/gemini-2.5-flash | <span class="ansi-gray">Updated:</span> ${new Date().toLocaleString()}`,
      `│  <span class="ansi-cyan">f2a9cc</span>… : <span class="ansi-white">add sandbox testing harness</span>`,
      `│    <span class="ansi-gray">Model:</span> anthropic/claude-3-5-sonnet | <span class="ansi-gray">Updated:</span> 2 hours ago`,
      `│`,
      `│  Type <span class="ansi-cyan">/switch &lt;id&gt;</span> to load a session.`,
      `<span class="ansi-cyan">└───────────────────────────────────────────────────</span>`
    ], 80);
    return;
  }
  
  if (lowercaseVal === '/config') {
    terminalState = 'wizard_provider';
    updateInputModeLabel('config');
    
    await printLinesAnimated([
      `<span class="ansi-cyan">╔══════════════════════════════════════════════════════════╗</span>`,
      `<span class="ansi-cyan">║</span>             <span class="ansi-white"><b>⚡ QUANDCODE CONFIG WIZARD ⚡</b></span>                <span class="ansi-cyan">║</span>`,
      `<span class="ansi-cyan">╚══════════════════════════════════════════════════════════╝</span>`,
      ``,
      `<span class="ansi-white">Select a provider:</span>`,
      `  <span class="ansi-cyan">1)</span> google`,
      `  <span class="ansi-cyan">2)</span> openai`,
      `  <span class="ansi-cyan">3)</span> anthropic`,
      `  <span class="ansi-cyan">4)</span> ollama (local)`,
      ``,
      `<span class="ansi-cyan">Enter choice (1-4) › </span>`
    ], 50);
    return;
  }
  
  if (lowercaseVal.startsWith('run ') || lowercaseVal === 'run') {
    const prompt = value.substring(4).trim() || "create a python game";
    runAgentLoopSimulation(prompt);
    return;
  }
  
  // Custom prompt search fallback
  runAgentLoopSimulation(value);
}

// Wizard state actions
function handleWizardProvider(value) {
  let provider = '';
  if (value === '1' || value.toLowerCase() === 'google') provider = 'google';
  else if (value === '2' || value.toLowerCase() === 'openai') provider = 'openai';
  else if (value === '3' || value.toLowerCase() === 'anthropic') provider = 'anthropic';
  else if (value === '4' || value.toLowerCase() === 'ollama') provider = 'ollama';
  
  if (!provider) {
    printLine(`<span class="ansi-red-bright">Invalid provider selection.</span> Please enter 1-4 or name.`);
    return;
  }
  
  wizardData.provider = provider;
  terminalState = 'wizard_model';
  
  let modelSuggestions = [];
  if (provider === 'google') modelSuggestions = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  else if (provider === 'openai') modelSuggestions = ['gpt-4o', 'gpt-4o-mini'];
  else if (provider === 'anthropic') modelSuggestions = ['claude-3-5-sonnet', 'claude-3-haiku'];
  else if (provider === 'ollama') modelSuggestions = ['qwen2.5-coder:7b', 'llama3.1:8b'];
  
  printLinesAnimated([
    `Selected Provider: <span class="ansi-cyan-bright">${provider}</span>`,
    ``,
    `<span class="ansi-white">Select model:</span>`,
    ...modelSuggestions.map((m, idx) => `  <span class="ansi-cyan">${idx+1})</span> ${m}`),
    ``,
    `<span class="ansi-cyan">Enter choice (1-2) › </span>`
  ], 50);
}

function handleWizardModel(value) {
  let model = value.trim();
  let provider = wizardData.provider;
  
  let modelSuggestions = [];
  if (provider === 'google') modelSuggestions = ['gemini-2.5-flash', 'gemini-2.5-pro'];
  else if (provider === 'openai') modelSuggestions = ['gpt-4o', 'gpt-4o-mini'];
  else if (provider === 'anthropic') modelSuggestions = ['claude-3-5-sonnet', 'claude-3-haiku'];
  else if (provider === 'ollama') modelSuggestions = ['qwen2.5-coder:7b', 'llama3.1:8b'];

  if (value === '1') model = modelSuggestions[0];
  else if (value === '2') model = modelSuggestions[1];

  activeProvider = provider;
  activeModel = model;
  
  terminalState = 'idle';
  updateInputModeLabel(currentMode);
  
  printLinesAnimated([
    `Selected Model: <span class="ansi-cyan-bright">${model}</span>`,
    `<span class="ansi-green-bright">✔ Configuration updated successfully.</span>`,
    `Saved to <span class="ansi-gray">quandcode.json</span>`,
    ``
  ], 60);
}

// Guard state actions
function handleGuardApproval(value) {
  const normVal = value.trim().toLowerCase();
  const callback = guardCallback;
  
  // reset guard state
  terminalState = 'idle';
  guardCallback = null;
  updateInputModeLabel(currentMode);

  if (normVal === 'y' || normVal === 'yes' || normVal === '') {
    callback(true);
  } else {
    callback(false);
  }
}

// Agent Execution Loop Simulation
async function runAgentLoopSimulation(prompt) {
  terminalInput.disabled = true;
  
  printLine(`<span class="ansi-cyan">Initializing Agent Loop...</span>`);
  await sleep(600);
  
  printLine(`  <span class="ansi-gray">Model:</span>    <span class="ansi-cyan-bright">${activeProvider}/${activeModel}</span>`);
  printLine(`  <span class="ansi-gray">Mode:</span>     ${getModeLabelHTML(currentMode)}`);
  printLine(`  <span class="ansi-gray">CWD:</span>      <span class="ansi-gray">C:\\Users\\Anish\\OneDrive\\Documents\\Big project\\quandcode</span>`);
  await sleep(700);
  
  printLine(`<span class="ansi-yellow">Checking dependencies and constraints...</span>`);
  await sleep(500);

  printLine(`<span class="ansi-magenta-bright">[PLAN]</span> Defining tasks to achieve goal: "${prompt}"`);
  await sleep(400);
  printLine(`  <span class="ansi-white">1. Create script file at packages/core/scratch/task_simulation.py</span>`);
  printLine(`  <span class="ansi-white">2. Run tests check</span>`);
  await sleep(900);

  // Security Guard popup
  printLine(``);
  printLine(`<span class="ansi-red-bright">🛡️</span> <span class="ansi-yellow-bright"><b>SECURITY GATE:</b></span> <span class="ansi-white">Requesting permission to run file_write on packages/core/scratch/task_simulation.py</span>`);
  
  terminalState = 'guard_approve';
  updateInputModeLabel('guard');
  
  printLine(`<span class="ansi-yellow">  Confirm (y/N) › </span>`, 'terminal-log-line');
  
  terminalInput.disabled = false;
  terminalInput.focus();

  // Setup the continuation after permission approval
  guardCallback = async (approved) => {
    terminalInput.disabled = true;
    if (!approved) {
      printLine(`<span class="ansi-red-bright">✖ Action rejected by user. Aborting agent run.</span>`);
      terminalInput.disabled = false;
      terminalInput.focus();
      return;
    }
    
    printLine(`<span class="ansi-green-bright">✔ Action approved. Executing tool...</span>`);
    await sleep(600);
    
    printLine(`<span class="ansi-cyan">Streaming code changes:</span>`);
    await sleep(300);
    
    const codeSnippet = [
      `+ import sys`,
      `+ def main():`,
      `+     print("Quandcode TUI simulation running successfully!")`,
      `+     print("Prompt resolved: ${escapeHtml(prompt)}")`,
      `+ if __name__ == '__main__':`,
      `+     main()`
    ];
    
    for (const code of codeSnippet) {
      printLine(`<span class="ansi-green-bright">${code}</span>`);
      await sleep(150);
    }
    
    await sleep(600);
    printLine(`<span class="ansi-yellow">Running local test runner...</span>`);
    await sleep(800);
    
    printLine(`<span class="ansi-green-bright">✔ 168 tests passed successfully!</span>`);
    await sleep(400);
    
    printLine(`<span class="ansi-cyan-bright">✔ GOAL ACHIEVED. Session state saved.</span>`);
    printLine(``);
    
    terminalInput.disabled = false;
    terminalInput.focus();
  };
}

// Helpers
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function escapeHtml(unsafe) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function copyInstallCmd() {
  const code = `git clone https://github.com/anishkashyap134567-ui/Quandcode.git
cd Quandcode
bun install
bun run quandcode`;
  navigator.clipboard.writeText(code).then(() => {
    const btn = document.querySelector('.copy-btn');
    btn.textContent = 'Copied!';
    setTimeout(() => {
      btn.textContent = 'Copy';
    }, 2000);
  });
}
