// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — LSP Client
// ═══════════════════════════════════════════════════════════
//
// A lightweight Language Server Protocol client.
// Manages language servers (e.g., rust-analyzer, tsserver, pylsp)
// and handles JSON-RPC communication over stdio.

import { z } from "zod";

export interface LSPConfig {
  command: string;
  args?: string[];
  cwd: string;
}

export interface Diagnostic {
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
  severity: number; // 1 = Error, 2 = Warning, 3 = Info, 4 = Hint
  message: string;
  source?: string;
}

export interface Location {
  uri: string;
  range: {
    start: { line: number; character: number };
    end: { line: number; character: number };
  };
}

export class LSPClient {
  private config: LSPConfig;
  private process: ReturnType<typeof Bun.spawn> | null = null;
  private messageId = 1;
  private pendingRequests = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();
  private buffer = "";

  // Handlers for server notifications
  public onDiagnostics?: (uri: string, diagnostics: Diagnostic[]) => void;

  constructor(config: LSPConfig) {
    this.config = config;
  }

  /**
   * Start the language server process.
   */
  async start(): Promise<void> {
    if (this.process) return;

    this.process = Bun.spawn([this.config.command, ...(this.config.args || [])], {
      cwd: this.config.cwd,
      stdin: "pipe",
      stdout: "pipe",
      stderr: "pipe",
    });

    // Start reading stdout asynchronously
    this.readStdout();

    // Send the initialize request
    const initResult = await this.sendRequest("initialize", {
      processId: process.pid,
      rootUri: `file://${this.config.cwd.replace(/\\/g, "/")}`,
      capabilities: {},
    });

    // Send the initialized notification
    this.sendNotification("initialized", {});
  }

  /**
   * Stop the language server.
   */
  async stop(): Promise<void> {
    if (!this.process) return;
    
    try {
      await this.sendRequest("shutdown", null);
      this.sendNotification("exit", null);
    } catch (e) {
      // Ignore errors during shutdown
    }
    
    this.process.kill();
    this.process = null;
  }

  /**
   * Get definitions for a symbol at the given position.
   */
  async getDefinition(filePath: string, line: number, character: number): Promise<Location[]> {
    const uri = `file://${filePath.replace(/\\/g, "/")}`;
    const result = await this.sendRequest("textDocument/definition", {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 }, // LSP is 0-indexed
    });

    if (!result) return [];
    return Array.isArray(result) ? result : [result];
  }

  /**
   * Get references for a symbol at the given position.
   */
  async getReferences(filePath: string, line: number, character: number): Promise<Location[]> {
    const uri = `file://${filePath.replace(/\\/g, "/")}`;
    const result = await this.sendRequest("textDocument/references", {
      textDocument: { uri },
      position: { line: line - 1, character: character - 1 },
      context: { includeDeclaration: true },
    });

    return result || [];
  }

  // ── JSON-RPC internals ──────────────────────────────────

  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.process) throw new Error("LSP server not running");

    const id = this.messageId++;
    const message = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const promise = new Promise<any>((resolve, reject) => {
      // Set a 10s timeout for requests
      const timeoutId = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`LSP request timeout: ${method}`));
      }, 10000);

      this.pendingRequests.set(id, {
        resolve: (val) => { clearTimeout(timeoutId); resolve(val); },
        reject: (err) => { clearTimeout(timeoutId); reject(err); },
      });
    });

    this.writeMessage(message);
    return promise;
  }

  private sendNotification(method: string, params: any): void {
    if (!this.process) return;

    const message = {
      jsonrpc: "2.0",
      method,
      params,
    };

    this.writeMessage(message);
  }

  private writeMessage(message: any): void {
    if (!this.process) return;
    const json = JSON.stringify(message);
    const payload = `Content-Length: ${Buffer.byteLength(json, "utf-8")}\r\n\r\n${json}`;
    (this.process.stdin as any).write(payload);
    (this.process.stdin as any).flush();
  }

  private async readStdout() {
    if (!this.process) return;

    try {
      const reader = (this.process.stdout as any).getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = new TextDecoder().decode(value);
        this.buffer += chunk;

        this.processBuffer();
      }
    } catch (e) {
      // Stream ended
    }
  }

  private processBuffer() {
    while (true) {
      // Look for the header
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) break;

      const headerText = this.buffer.substring(0, headerEnd);
      const contentLengthMatch = headerText.match(/Content-Length: (\d+)/i);
      
      if (!contentLengthMatch) {
        // Malformed header, just clear it and hope for the best
        this.buffer = this.buffer.substring(headerEnd + 4);
        continue;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const totalMessageLength = headerEnd + 4 + contentLength;

      if (this.buffer.length < totalMessageLength) {
        // Not enough data yet
        break;
      }

      // Extract the body
      const body = this.buffer.substring(headerEnd + 4, totalMessageLength);
      this.buffer = this.buffer.substring(totalMessageLength);

      try {
        const message = JSON.parse(body);
        this.handleMessage(message);
      } catch (e) {
        console.error("Failed to parse LSP message:", e);
      }
    }
  }

  private handleMessage(message: any) {
    if (message.id !== undefined) {
      // It's a response to a request
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(`LSP error: ${message.error.message}`));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // It's a notification from the server
      if (message.method === "textDocument/publishDiagnostics") {
        if (this.onDiagnostics) {
          const uri = message.params.uri;
          const diagnostics = message.params.diagnostics;
          this.onDiagnostics(uri, diagnostics);
        }
      }
    }
  }
}
