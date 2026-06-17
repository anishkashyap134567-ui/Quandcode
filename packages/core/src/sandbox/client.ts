// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — Rust Sandbox Client
// ═══════════════════════════════════════════════════════════
//
// Client for the Rust-based command sandboxing engine.
// Executes the compiled rust binary, pipes JSON to stdin,
// and parses JSON from stdout.

import * as path from "node:path";
import * as fs from "node:fs";

export interface SandboxConfig {
  writable_paths: string[];
  network_allowlist: string[];
  env_vars: string[];
  timeout_seconds: number;
}

export interface SandboxRequest {
  command: string;
  args: string[];
  cwd: string;
  config: SandboxConfig;
}

export interface SandboxResult {
  exit_code: number;
  stdout: string;
  stderr: string;
  timed_out: boolean;
}

export class SandboxClient {
  private binaryPath: string;

  constructor() {
    // Determine the path to the compiled Rust binary
    // In dev, we might use cargo run or the debug build.
    // In prod, it should be in the target/release folder.
    const isWindows = process.platform === "win32";
    const binName = isWindows ? "quandcode-sandbox.exe" : "quandcode-sandbox";
    
    // Look for release first, then debug
    const releasePath = path.resolve(process.cwd(), "packages/sandbox/target/release", binName);
    const debugPath = path.resolve(process.cwd(), "packages/sandbox/target/debug", binName);
    
    if (fs.existsSync(releasePath)) {
      this.binaryPath = releasePath;
    } else if (fs.existsSync(debugPath)) {
      this.binaryPath = debugPath;
    } else {
      // Fallback: we will try to use cargo run if binary doesn't exist
      this.binaryPath = ""; 
    }
  }

  /**
   * Execute a command within the Rust sandbox.
   */
  async execute(request: SandboxRequest): Promise<SandboxResult> {
    try {
      let proc;
      const inputJson = JSON.stringify(request) + "\n";

      if (this.binaryPath) {
        // Run the compiled binary
        proc = Bun.spawn([this.binaryPath], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        });
      } else {
        // Fallback to cargo run (slower, but works for dev)
        proc = Bun.spawn(["cargo", "run", "--manifest-path", "packages/sandbox/Cargo.toml", "--quiet"], {
          stdin: "pipe",
          stdout: "pipe",
          stderr: "pipe",
        });
      }

      // Write request to stdin
      proc.stdin.write(inputJson);
      proc.stdin.flush();
      proc.stdin.end();

      // Read output
      const stdout = await new Response(proc.stdout).text();
      const stderr = await new Response(proc.stderr).text();
      
      await proc.exited;

      try {
        // Parse the JSON output from the sandbox
        return JSON.parse(stdout) as SandboxResult;
      } catch (parseError) {
        // If it failed to parse, the sandbox might have crashed or printed non-JSON
        return {
          exit_code: -1,
          stdout: stdout.trim(),
          stderr: `Failed to parse sandbox output: ${(parseError as Error).message}\nRaw Output: ${stdout}\nRaw Stderr: ${stderr}`,
          timed_out: false,
        };
      }
    } catch (err) {
      return {
        exit_code: -1,
        stdout: "",
        stderr: `Failed to invoke sandbox: ${(err as Error).message}`,
        timed_out: false,
      };
    }
  }
}
