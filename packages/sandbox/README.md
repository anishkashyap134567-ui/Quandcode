# QuandCode Sandbox

Rust-based process sandboxing for secure command execution.

## Features (Phase 10)
- Windows: Job objects with restricted tokens
- Linux: bubblewrap (bwrap) integration  
- macOS: sandbox-exec profiles
- Configurable writable paths, network, and env var restrictions

## Build
```bash
cargo build --release
```
