/**
 * Spawns the published entry point exactly as a client would and drives a real MCP
 * handshake through it against the hosted server.
 *
 * This exists because a broken publish is otherwise invisible: the package installs
 * fine, the client shows it as "connected", and every tool call silently returns
 * nothing. The only proof that matters is that a spawned process answers initialize and
 * lists the tools it is supposed to list.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const ENTRY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "index.js");
const TIMEOUT_MS = 30_000;

const EXPECTED_TOOLS = [
  "search_city",
  "get_sun_times",
  "get_vitamin_d_window",
  "get_vitamin_d_year",
  "get_current_status",
  "estimate_sun_session",
];

function request(child, message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

async function main() {
  const child = spawn(process.execPath, [ENTRY], { stdio: ["pipe", "pipe", "pipe"] });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  const responses = new Map();
  let buffer = "";
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    let index;
    while ((index = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, index).trim();
      buffer = buffer.slice(index + 1);
      if (!line) continue;
      const message = JSON.parse(line);
      if (message.id !== undefined) responses.set(message.id, message);
    }
  });

  const waitFor = (id) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = setInterval(() => {
        if (responses.has(id)) {
          clearInterval(tick);
          resolve(responses.get(id));
        } else if (Date.now() - started > TIMEOUT_MS) {
          clearInterval(tick);
          reject(new Error(`timed out waiting for response ${id}. stderr: ${stderr}`));
        }
      }, 100);
    });

  request(child, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "handshake-test", version: "0" },
    },
  });

  const initialize = await waitFor(1);
  assert.ok(initialize.result, `initialize returned no result: ${JSON.stringify(initialize)}`);
  assert.equal(initialize.result.serverInfo?.name, "vitamind-explorer");
  console.log(
    `initialize ok — ${initialize.result.serverInfo.name} ${initialize.result.serverInfo.version}, protocol ${initialize.result.protocolVersion}`,
  );

  request(child, { jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  request(child, { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });

  const list = await waitFor(2);
  assert.ok(list.result?.tools, `tools/list returned no tools: ${JSON.stringify(list)}`);
  const names = list.result.tools.map((t) => t.name);
  console.log(`tools/list ok — ${names.length} tools`);

  const missing = EXPECTED_TOOLS.filter((t) => !names.includes(t));
  assert.deepEqual(missing, [], `public tools missing from the bridged server: ${missing}`);

  request(child, {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "search_city", arguments: { query: "Madrid" } },
  });

  const call = await waitFor(3);
  assert.ok(call.result, `tools/call returned no result: ${JSON.stringify(call)}`);
  const text = JSON.stringify(call.result);
  assert.match(text, /adrid/, `search_city did not find Madrid: ${text}`);
  console.log("tools/call ok — search_city returned Madrid");

  child.kill();
  console.log("\nPASS");
}

main().catch((error) => {
  console.error(`\nFAIL: ${error.message}`);
  process.exit(1);
});
