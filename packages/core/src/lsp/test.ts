#!/usr/bin/env bun
// ═══════════════════════════════════════════════════════════
// ⚡ QuandCode — LSP Tests
// ═══════════════════════════════════════════════════════════

import chalk from "chalk";
import * as path from "node:path";
import * as fs from "node:fs";
import { LSPClient } from "./client.js";

const banner = `
${chalk.cyan("╔═══════════════════════════════════════════╗")}
${chalk.cyan("║")}  ${chalk.bold.yellowBright("⚡")} ${chalk.bold.cyanBright("QuandCode LSP Tests")} ${chalk.bold.yellowBright("⚡")}           ${chalk.cyan("║")}
${chalk.cyan("╚═══════════════════════════════════════════╝")}
`;

console.log(banner);

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void | Promise<void>) {
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result
        .then(() => { console.log(chalk.green(`  ✔ ${name}`)); passed++; })
        .catch((err: Error) => { console.log(chalk.red(`  ✖ ${name}`)); console.log(chalk.red(`    ${err.message}`)); failed++; });
    }
    console.log(chalk.green(`  ✔ ${name}`)); passed++;
    return Promise.resolve();
  } catch (err: any) {
    console.log(chalk.red(`  ✖ ${name}`)); console.log(chalk.red(`    ${err.message}`)); failed++;
    return Promise.resolve();
  }
}

async function runTests() {
  // We'll test with a simple script that echoes back JSON-RPC
  // because testing a real LSP server requires it to be installed
  // and they are often slow to start.
  
  const mockServerPath = path.resolve(process.cwd(), "mock_lsp.ts");
  
  fs.writeFileSync(mockServerPath, `
    let buffer = "";
    process.stdin.on("data", (chunk) => {
      buffer += chunk.toString();
      while (true) {
        const headerEnd = buffer.indexOf("\\r\\n\\r\\n");
        if (headerEnd === -1) break;
        
        const headerText = buffer.substring(0, headerEnd);
        const match = headerText.match(/Content-Length: (\\d+)/i);
        if (!match) { buffer = ""; break; }
        
        const len = parseInt(match[1]);
        const totalLen = headerEnd + 4 + len;
        
        if (buffer.length < totalLen) break;
        
        const body = buffer.substring(headerEnd + 4, totalLen);
        buffer = buffer.substring(totalLen);
        
        const msg = JSON.parse(body);
        
        if (msg.method === "initialize") {
          send({ jsonrpc: "2.0", id: msg.id, result: { capabilities: {} } });
        } else if (msg.method === "textDocument/definition") {
          send({
            jsonrpc: "2.0",
            id: msg.id,
            result: [{ uri: "file:///test/file.ts", range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } } }]
          });
        }
      }
    });
    
    function send(msg) {
      const str = JSON.stringify(msg);
      process.stdout.write(\`Content-Length: \${Buffer.byteLength(str, "utf8")}\\r\\n\\r\\n\${str}\`);
    }
  `, "utf-8");

  await test("LSP Client Initialization", async () => {
    const client = new LSPClient({
      command: "bun",
      args: ["run", mockServerPath],
      cwd: process.cwd(),
    });

    await client.start();
    await client.stop();
  });

  await test("LSP Client Definition Request", async () => {
    const client = new LSPClient({
      command: "bun",
      args: ["run", mockServerPath],
      cwd: process.cwd(),
    });

    await client.start();
    
    const def = await client.getDefinition("/test/file.ts", 1, 1);
    
    if (def.length === 0) throw new Error("Expected a definition");
    if (def[0].uri !== "file:///test/file.ts") throw new Error("URI mismatch");
    
    await client.stop();
  });

  // Cleanup
  fs.unlinkSync(mockServerPath);

  // ── Results ────────────────────────────────────────────
  console.log(chalk.cyan("\n  " + "═".repeat(38)));
  console.log(
    `  ${chalk.bold.green(`${passed} passed`)}  ${
      failed > 0 ? chalk.bold.red(`${failed} failed`) : chalk.gray("0 failed")
    }`
  );
  console.log(chalk.cyan("  " + "═".repeat(38)));
  console.log();

  if (failed > 0) process.exit(1);
  process.exit(0);
}

runTests().catch((err) => {
  console.error(chalk.red(`\n✖ Test runner error: ${err.message}`));
  console.error(err.stack);
  process.exit(1);
});
