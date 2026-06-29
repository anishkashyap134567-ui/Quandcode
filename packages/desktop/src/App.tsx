import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";

// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode Desktop — Faithful TUI Replica
// ═══════════════════════════════════════════════════════════

// ── Types ──────────────────────────────────────────────────

interface TerminalLine {
  id: string;
  type: "banner" | "session-start" | "tree" | "tool-header" | "tool-call" | "tool-result" | "security-gate" | "assistant-header" | "assistant-text" | "summary" | "system" | "divider" | "thinking" | "user-prompt";
  content: React.ReactNode;
}

type AgentMode = "build" | "plan";

// ── Spinner ────────────────────────────────────────────────

const MATRIX_FRAMES = ["⣾", "⣽", "⣻", "⢿", "⡿", "⣟", "⣯", "⣷"];

function MatrixSpinner() {
  const [frame, setFrame] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setFrame(f => (f + 1) % MATRIX_FRAMES.length), 100);
    return () => clearInterval(id);
  }, []);
  return <span className="thinking-line">{MATRIX_FRAMES[frame]}</span>;
}

// ── Tool Icons ─────────────────────────────────────────────

const TOOL_ICONS: Record<string, string> = {
  file_read:  "📖",
  file_write: "📝",
  file_edit:  "✏️",
  bash:       "💻",
  grep:       "🔍",
  glob:       "📁",
  list_dir:   "📂",
  plan_enter: "🧠",
  plan_exit:  "🔨",
  lsp_query:  "🔬",
};

// ── App ────────────────────────────────────────────────────

export default function App() {
  const [workspace, setWorkspace] = useState<string | null>(null);
  const [mode, setMode] = useState<AgentMode>("build");
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [activeTab, setActiveTab] = useState<"console" | "diff">("console");
  const [diffTab, setDiffTab] = useState<"diff" | "source">("diff");

  // Stats
  const [stats, setStats] = useState({
    inputTokens: 0,
    outputTokens: 0,
    toolCalls: 0,
    durationMs: 0,
    sessionId: "",
  });

  const outputRef = useRef<HTMLDivElement>(null);

  // Auto-scroll terminal
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [lines]);

  // Load workspace on mount
  useEffect(() => {
    invoke<string | null>("get_workspace")
      .then(p => { if (p) setWorkspace(p); })
      .catch(() => {});
  }, []);

  const addLine = (line: Omit<TerminalLine, "id">) => {
    setLines(prev => [...prev, { ...line, id: `${Date.now()}-${Math.random()}` }]);
  };

  const handleOpenWorkspace = async () => {
    try {
      const selected = await invoke<string | null>("select_directory");
      if (selected) {
        setWorkspace(selected);
        await invoke("set_workspace", { path: selected });
        addLine({
          type: "system",
          content: <span className="system-text">Workspace set to: {selected}</span>
        });
      }
    } catch (err) {
      console.error(err);
    }
  };

  // ── Simulate QuandCode Agent Loop ────────────────────────

  const runAgentLoop = (_prompt: string) => {
    const sessionId = `ses_${Math.random().toString(36).substring(2, 10)}`;
    setStats(s => ({ ...s, sessionId }));

    // ┌ Session start
    addLine({
      type: "session-start",
      content: (
        <span className="line-session">
          <span className="tree-char">┌</span>{" "}
          <span style={{ color: "var(--text-dim)" }}>Session:</span>{" "}
          <span className="session-id">{sessionId}</span>
          {"  "}
          <span className="mode-tag">▶ {mode.toUpperCase()}</span>
        </span>
      )
    });

    addLine({ type: "tree", content: <span className="tree-char">│</span> });

    // Thinking...
    setIsThinking(true);

    setTimeout(() => {
      setIsThinking(false);
      setStats(s => ({ ...s, inputTokens: s.inputTokens + 1247, outputTokens: s.outputTokens + 382 }));

      // ⚡ Assistant text
      addLine({
        type: "assistant-header",
        content: (
          <span>
            <span className="tree-char">│</span>{" "}
            <span className="assistant-icon">⚡</span>{" "}
            <span className="assistant-label">Assistant</span>
          </span>
        )
      });
      addLine({ type: "tree", content: <span className="tree-char">│</span> });

      const responseLines = [
        `I'll analyze your request and implement the changes.`,
        ``,
        `## Plan`,
        `- Read the target file to understand current structure`,
        `- Apply the requested modifications`,
        `- Verify the changes compile correctly`,
      ];

      for (const line of responseLines) {
        let node: React.ReactNode;
        if (line.startsWith("##")) {
          node = <span><span className="tree-char">│</span>{"   "}<span className="assistant-heading">{line}</span></span>;
        } else if (line.startsWith("- ")) {
          node = <span><span className="tree-char">│</span>{"   "}<span className="assistant-bullet">▸</span> <span className="assistant-text">{line.substring(2)}</span></span>;
        } else if (line === "") {
          node = <span className="tree-char">│</span>;
        } else {
          node = <span><span className="tree-char">│</span>{"   "}<span className="assistant-text">{line}</span></span>;
        }
        addLine({ type: "assistant-text", content: node });
      }

      // ⚙ Tool Execution
      setTimeout(() => {
        addLine({ type: "tree", content: <span className="tree-char">│</span> });
        addLine({
          type: "tool-header",
          content: (
            <span>
              <span className="tree-char">│</span>{" "}
              <span className="tool-header">⚙ Tool Execution</span>{" "}
              <span className="tool-args">(2 tool calls)</span>
            </span>
          )
        });

        // Tool call 1: file_read
        addLine({
          type: "tool-call",
          content: (
            <span>
              <span className="tree-char">│</span>{"   "}
              <span>{TOOL_ICONS.file_read}</span>{" "}
              <span className="tool-name">file_read</span>{" "}
              <span className="tool-args">{`{"path":"src/index.ts"}`}</span>
            </span>
          )
        });

        // Tool result 1
        setTimeout(() => {
          setStats(s => ({ ...s, toolCalls: s.toolCalls + 1 }));
          addLine({
            type: "tool-result",
            content: (
              <span>
                <span className="tree-char">│</span>{"   "}
                <span className="tool-success">✔</span>{" "}
                <span className="tool-args">file_read</span>{" → "}
                <span className="tool-result-text">File read successfully (42 lines)</span>
              </span>
            )
          });

          // 🛡️ Security Gate for file_write
          setTimeout(() => {
            addLine({ type: "tree", content: <span className="tree-char">│</span> });
            addLine({
              type: "security-gate",
              content: (
                <span className="security-gate">
                  <span className="tree-char">│</span>{" "}
                  🛡️ <span style={{ fontWeight: 700 }}>SECURITY GATE:</span>{" "}
                  <span className="confirm-text">Allow tool "file_write"? (path: src/index.ts)</span>
                </span>
              )
            });
            addLine({
              type: "security-gate",
              content: (
                <span className="security-gate">
                  <span className="tree-char">│</span>{"   "}
                  Confirm (y/N) ›{" "}
                  <span className="confirm-answer">y</span>
                </span>
              )
            });

            // Tool call 2: file_write
            addLine({
              type: "tool-call",
              content: (
                <span>
                  <span className="tree-char">│</span>{"   "}
                  <span>{TOOL_ICONS.file_write}</span>{" "}
                  <span className="tool-name">file_write</span>{" "}
                  <span className="tool-args">{`{"path":"src/index.ts","content":"..."}`}</span>
                </span>
              )
            });

            setTimeout(() => {
              setStats(s => ({
                ...s,
                toolCalls: s.toolCalls + 1,
                inputTokens: s.inputTokens + 860,
                outputTokens: s.outputTokens + 215,
                durationMs: 4200,
              }));

              addLine({
                type: "tool-result",
                content: (
                  <span>
                    <span className="tree-char">│</span>{"   "}
                    <span className="tool-success">✔</span>{" "}
                    <span className="tool-args">file_write</span>{" → "}
                    <span className="tool-result-text">File src/index.ts successfully written.</span>
                  </span>
                )
              });

              // Close session
              setTimeout(() => {
                addLine({ type: "tree", content: <span className="tree-char">│</span> });
                addLine({
                  type: "divider",
                  content: (
                    <span>
                      <span className="tree-char">└</span>
                      <span className="tree-char">{"─".repeat(59)}</span>
                    </span>
                  )
                });

                // Summary box
                addLine({
                  type: "summary",
                  content: (
                    <div className="summary-box">
                      <div className="summary-top">Session Summary</div>
                      <div className="summary-body">
                        <span><span className="summary-label">Finish:</span> <span className="summary-value-green">✔ Complete</span></span>
                        <span><span className="summary-label">Turns:</span> <span className="summary-value-cyan">2</span></span>
                        <span><span className="summary-label">Tools:</span> <span className="summary-value-yellow">2 calls</span></span>
                        <span><span className="summary-label">Tokens:</span> <span className="summary-value-cyan">2,107</span>↓ <span className="summary-value-magenta">597</span>↑</span>
                        <span><span className="summary-label">Duration:</span> <span className="summary-value-green">4.2s</span></span>
                      </div>
                    </div>
                  )
                });

                setIsThinking(false);
              }, 600);
            }, 800);
          }, 700);
        }, 600);
      }, 1000);
    }, 1800);
  };

  const handleSend = () => {
    if (!inputValue.trim() || isThinking) return;
    const prompt = inputValue;
    setInputValue("");

    addLine({
      type: "user-prompt",
      content: (
        <span>
          <span className="input-mode">
            <span className="mode-icon">▶</span>{" "}
            <span className="mode-label">{mode.toUpperCase()}</span>
          </span>{" "}
          <span className="input-chevron">›</span>{" "}
          <span style={{ color: "var(--text-bright)", fontWeight: 700 }}>{prompt}</span>
        </span>
      )
    });

    runAgentLoop(prompt);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // ── Render ──────────────────────────────────────────────

  return (
    <div className="app-container">

      {/* ═══ SIDEBAR ═══ */}
      <aside className="sidebar">

        {/* Banner */}
        <div className="sidebar-header">
          <pre className="banner-box">{
`╔════════════════════════════════════╗
║  `}<span className="banner-title">█▀█ █ █ █▀█ █▄ █ █▀▄ █▀▀ █▀█ █▀▄ █▀▀</span>{`  ║
║  `}<span className="banner-title">█▄█ █▄█ █▀█ █ ▀█ █▄▀ █▄▄ █▄█ █▄▀ ██▄</span>{`  ║
║                                    ║
║  `}<span className="banner-subtitle"><span className="accent">⚡</span> The AI Coding Agent · v0.1.0</span>{`   ║
╚════════════════════════════════════╝`}
          </pre>
        </div>

        {/* Environment */}
        <div className="sidebar-env">
          <div className="env-row">
            <span className="env-label">Model:</span>
            <span className="env-value">google/gemini-2.5-flash</span>
          </div>
          <div className="env-row">
            <span className="env-label">Mode:</span>
            <span
              className={`env-value ${mode === "build" ? "mode-build" : "mode-plan"}`}
              onClick={() => setMode(m => m === "build" ? "plan" : "build")}
              style={{ cursor: "pointer" }}
            >
              {mode === "build" ? "▶  BUILD" : "◆  PLAN"}
            </span>
          </div>
          <div className="env-row">
            <span className="env-label">CWD:</span>
            <span className="env-value" style={{ color: "var(--text)", fontSize: "0.65rem", wordBreak: "break-all" }}>
              {workspace || "—"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="sidebar-actions">
          <button className="workspace-btn" onClick={handleOpenWorkspace}>
            📂 {workspace ? "Switch Workspace" : "Open Workspace"}
          </button>
        </div>

        {/* Files */}
        <div className="sidebar-section">
          <div className="section-label">Workspace Files</div>
          <div className="file-item active"><span className="file-icon">📖</span> src/index.ts</div>
          <div className="file-item"><span className="file-icon">📝</span> src/agent/loop.ts</div>
          <div className="file-item"><span className="file-icon">⚙️</span> quandcode.json</div>
          <div className="file-item"><span className="file-icon">📂</span> packages/core/</div>
          <div className="file-item"><span className="file-icon">📂</span> packages/tui/</div>
          <div className="file-item"><span className="file-icon">📂</span> packages/sandbox/</div>
        </div>

        {/* Status */}
        <div className="sidebar-status">
          <div className="status-row">
            <span className="status-dot"></span>
            <span style={{ color: "var(--neon-green)" }}>Sandbox Active</span>
            <span style={{ color: "var(--text-dim)" }}> · Rust Job Objects</span>
          </div>
        </div>
      </aside>

      {/* ═══ MAIN ═══ */}
      <main className="main-content">
        <div className="workspace-split">

          {/* ── LEFT: Terminal Console ── */}
          <section className="terminal-panel">
            <div className="panel-tab-bar">
              <span
                className={`tab-item ${activeTab === "console" ? "active" : ""}`}
                onClick={() => setActiveTab("console")}
              >
                ⚡ Console
              </span>
              <span
                className={`tab-item ${activeTab === "diff" ? "active" : ""}`}
                onClick={() => setActiveTab("diff")}
              >
                📝 Output
              </span>
            </div>

            <div className="terminal-output" ref={outputRef}>
              {lines.length === 0 && (
                <span className="system-text">
                  Type a prompt to begin, or /help for commands.
                </span>
              )}
              {lines.map(line => (
                <span key={line.id} className="line">{line.content}</span>
              ))}
              {isThinking && (
                <span className="line">
                  <span className="tree-char">│</span>{" "}
                  <MatrixSpinner />{" "}
                  <span style={{ color: "var(--text-dim)" }}>Thinking...</span>
                </span>
              )}
            </div>

            {/* Input bar */}
            <div className="input-bar">
              <div className="input-mode">
                <span className="mode-icon">▶</span>
                <span className="mode-label">{mode.toUpperCase()}</span>
              </div>
              <span className="input-chevron">›</span>
              <input
                className="chat-input"
                type="text"
                placeholder="Type a prompt..."
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isThinking}
                autoFocus
              />
            </div>
          </section>

          {/* ── RIGHT: Code Diff ── */}
          <section className="diff-panel">
            <div className="panel-tab-bar">
              <span
                className={`tab-item ${diffTab === "diff" ? "active" : ""}`}
                onClick={() => setDiffTab("diff")}
              >
                ✏️ Diff View
              </span>
              <span
                className={`tab-item ${diffTab === "source" ? "active" : ""}`}
                onClick={() => setDiffTab("source")}
              >
                📖 Source
              </span>
            </div>

            <div className="diff-content">
              {diffTab === "diff" ? (
                <pre>
                  <span className="diff-line diff-context"><span className="diff-line-number">1</span>{`import { SessionManager } from './session/session';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">2</span>{`import { ProviderRegistry } from './provider/registry';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">3</span>{`import { ToolRegistry } from './tool/registry';`}</span>
                  <span className="diff-line diff-remove"><span className="diff-line-number">4</span>{`- import { AgentLoop } from './agent/loop';`}</span>
                  <span className="diff-line diff-add"><span className="diff-line-number">4</span>{`+ import { AgentLoop, AgentConfig } from './agent/loop';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">5</span>{`import { LSPClient } from './lsp/client';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">6</span>{``}</span>
                  <span className="diff-line diff-remove"><span className="diff-line-number">7</span>{`- export function createAgent() {`}</span>
                  <span className="diff-line diff-add"><span className="diff-line-number">7</span>{`+ export function createAgent(config?: AgentConfig) {`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">8</span>{`  const session = new SessionManager();`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">9</span>{`  const providers = new ProviderRegistry();`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">10</span>{`  const tools = new ToolRegistry();`}</span>
                  <span className="diff-line diff-remove"><span className="diff-line-number">11</span>{`-   return new AgentLoop(session, providers, tools);`}</span>
                  <span className="diff-line diff-add"><span className="diff-line-number">11</span>{`+   const lsp = new LSPClient();`}</span>
                  <span className="diff-line diff-add"><span className="diff-line-number">12</span>{`+   return new AgentLoop(session, providers, tools, lsp, config);`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">13</span>{`}`}</span>
                </pre>
              ) : (
                <pre>
                  <span className="diff-line diff-context"><span className="diff-line-number">1</span>{`import { SessionManager } from './session/session';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">2</span>{`import { ProviderRegistry } from './provider/registry';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">3</span>{`import { ToolRegistry } from './tool/registry';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">4</span>{`import { AgentLoop, AgentConfig } from './agent/loop';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">5</span>{`import { LSPClient } from './lsp/client';`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">6</span>{``}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">7</span>{`export function createAgent(config?: AgentConfig) {`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">8</span>{`  const session = new SessionManager();`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">9</span>{`  const providers = new ProviderRegistry();`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">10</span>{`  const tools = new ToolRegistry();`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">11</span>{`  const lsp = new LSPClient();`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">12</span>{`  return new AgentLoop(session, providers, tools, lsp, config);`}</span>
                  <span className="diff-line diff-context"><span className="diff-line-number">13</span>{`}`}</span>
                </pre>
              )}
            </div>
          </section>
        </div>

        {/* ═══ STATUS BAR ═══ */}
        <footer className="status-bar">
          <div className="status-left">
            <span className="status-mode-tag">▶ {mode.toUpperCase()}</span>
            <span className="status-sep">│</span>
            <span className="status-model">
              google/<span className="model-name">gemini-2.5-flash</span>
            </span>
          </div>
          <div className="status-right">
            <span className="status-tokens">
              tokens: <span className="tok-in">{stats.inputTokens.toLocaleString()}</span>↓{" "}
              <span className="tok-out">{stats.outputTokens.toLocaleString()}</span>↑
            </span>
            <span className="status-sep">│</span>
            <span className="status-tools">{stats.toolCalls} tools</span>
            <span className="status-sep">│</span>
            <span className="status-duration">{formatDuration(stats.durationMs)}</span>
          </div>
        </footer>
      </main>
    </div>
  );
}
