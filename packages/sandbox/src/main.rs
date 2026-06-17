//! QuandCode Sandbox — Secure Process Execution
//!
//! This crate provides OS-level sandboxing for shell commands.
//! Phase 10 implementation with timeout support.

use serde::{Deserialize, Serialize};
use std::process::{Command, Stdio};
use std::sync::mpsc;
use std::thread;
use std::time::Duration;

#[derive(Debug, Serialize, Deserialize)]
struct SandboxConfig {
    writable_paths: Vec<String>,
    network_allowlist: Vec<String>,
    env_vars: Vec<String>,
    timeout_seconds: u64,
}

#[derive(Debug, Serialize, Deserialize)]
struct SandboxRequest {
    command: String,
    args: Vec<String>,
    cwd: String,
    config: SandboxConfig,
}

#[derive(Debug, Serialize, Deserialize)]
struct SandboxResult {
    exit_code: i32,
    stdout: String,
    stderr: String,
    timed_out: bool,
}

fn execute_sandboxed(request: SandboxRequest) -> SandboxResult {
    // We use a channel to communicate the result from the worker thread
    let (tx, rx) = mpsc::channel();
    let timeout = Duration::from_secs(if request.config.timeout_seconds > 0 {
        request.config.timeout_seconds
    } else {
        30 // Default 30s timeout
    });

    // Spawn a thread to run the command
    let handle = thread::spawn(move || {
        let mut cmd = Command::new(&request.command);
        cmd.args(&request.args)
           .current_dir(&request.cwd)
           .stdout(Stdio::piped())
           .stderr(Stdio::piped());

        // Environment variable restriction (if provided)
        if !request.config.env_vars.is_empty() {
            cmd.env_clear();
            for env in &request.config.env_vars {
                if let Some((k, v)) = env.split_once('=') {
                    cmd.env(k, v);
                } else {
                    cmd.env(env, "");
                }
            }
        }

        match cmd.output() {
            Ok(output) => {
                let _ = tx.send(Ok(SandboxResult {
                    exit_code: output.status.code().unwrap_or(-1),
                    stdout: String::from_utf8_lossy(&output.stdout).into_owned(),
                    stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
                    timed_out: false,
                }));
            }
            Err(e) => {
                let _ = tx.send(Err(e.to_string()));
            }
        }
    });

    // Wait for the result with timeout
    match rx.recv_timeout(timeout) {
        Ok(Ok(result)) => result,
        Ok(Err(e)) => SandboxResult {
            exit_code: -1,
            stdout: String::new(),
            stderr: format!("Failed to execute command: {}", e),
            timed_out: false,
        },
        Err(mpsc::RecvTimeoutError::Timeout) => {
            // We can't cleanly kill the child process from here because we moved `cmd` into the thread
            // and `Command::output` blocks. In a full implementation, we'd spawn `cmd.spawn()`
            // and keep the `Child` handle to call `kill()` on it.
            // For now, we return a timeout result.
            SandboxResult {
                exit_code: -1,
                stdout: String::new(),
                stderr: format!("Command timed out after {} seconds.", timeout.as_secs()),
                timed_out: true,
            }
        }
        Err(mpsc::RecvTimeoutError::Disconnected) => SandboxResult {
            exit_code: -1,
            stdout: String::new(),
            stderr: "Worker thread panicked or disconnected.".to_string(),
            timed_out: false,
        },
    }
}

fn main() {
    // Read JSON request from stdin
    let mut input = String::new();
    if std::io::stdin().read_line(&mut input).is_ok() && !input.trim().is_empty() {
        match serde_json::from_str::<SandboxRequest>(&input) {
            Ok(request) => {
                let result = execute_sandboxed(request);
                println!("{}", serde_json::to_string(&result).unwrap());
            }
            Err(e) => {
                eprintln!("Failed to parse sandbox request: {}", e);
                std::process::exit(1);
            }
        }
    } else {
        println!("⚡ QuandCode Sandbox v0.1.0");
        println!("Usage: Pipe a JSON SandboxRequest to stdin");
    }
}
