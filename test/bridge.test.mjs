import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const entry = fileURLToPath(new URL("../index.js", import.meta.url));
const preload = new URL("./mock-upstream.mjs", import.meta.url).href;
const endpoint = "https://fixture.invalid/mcp";

function child(args = [], env = {}) {
  const proc = spawn(process.execPath, ["--import", preload, entry, ...args], {
    // No inherited provider credentials, endpoint overrides or NODE_OPTIONS.
    env: { SystemRoot: process.env.SystemRoot, VITAMIND_MCP_URL: endpoint, ...env },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let output = "";
  let errors = "";
  const closed = once(proc, "close");
  proc.stdout.setEncoding("utf8").on("data", (data) => { output += data; });
  proc.stderr.setEncoding("utf8").on("data", (data) => { errors += data; });
  return { proc, closed, output: () => output, errors: () => errors };
}

async function response(bridge, id) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const messages = bridge.output().split("\n").filter(Boolean).map((line) => JSON.parse(line));
    const message = messages.find((item) => item.id === id);
    if (message) return message;
    if (bridge.proc.exitCode !== null) throw new Error(bridge.errors());
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`offline response timeout: ${bridge.errors()}`);
}

function send(bridge, message) {
  bridge.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...message })}\n`);
}

test("stdio forwards initialize, tools and JSON-RPC errors without network", { timeout: 10_000 }, async (t) => {
  const bridge = child(["--url", endpoint]);
  t.after(async () => {
    if (bridge.proc.exitCode === null) bridge.proc.kill();
    await bridge.closed;
  });
  send(bridge, { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "offline", version: "0" } } });
  assert.equal((await response(bridge, 1)).result.serverInfo.name, "synthetic-upstream");
  send(bridge, { method: "notifications/initialized" });
  send(bridge, { id: 2, method: "tools/list", params: {} });
  assert.equal((await response(bridge, 2)).result.tools[0].name, "fixture_tool");
  const params = { name: "fixture_tool", arguments: { value: "synthetic" } };
  send(bridge, { id: 3, method: "tools/call", params });
  assert.deepEqual(JSON.parse((await response(bridge, 3)).result.content[0].text), params);
  send(bridge, { id: 4, method: "fixture/missing", params: {} });
  assert.deepEqual((await response(bridge, 4)).error, { code: -32601, message: "synthetic method missing" });
  assert.equal(bridge.errors(), "");
});

test("fetch failure exits with stderr and leaves protocol stdout clean", { timeout: 10_000 }, async (t) => {
  const bridge = child([`--url=${endpoint}/failure`]);
  t.after(async () => { if (bridge.proc.exitCode === null) bridge.proc.kill(); await bridge.closed; });
  send(bridge, { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "offline", version: "0" } } });
  const [code] = await bridge.closed;
  assert.equal(code, 1);
  assert.match(bridge.errors(), /synthetic upstream failure/);
  assert.equal(bridge.output(), "");
});

test("invalid URL fails before transport setup", { timeout: 10_000 }, async (t) => {
  const bridge = child(["--url", "invalid endpoint"]);
  t.after(async () => { if (bridge.proc.exitCode === null) bridge.proc.kill(); await bridge.closed; });
  const [code] = await bridge.closed;
  assert.equal(code, 1);
  assert.match(bridge.errors(), /invalid --url/);
  assert.equal(bridge.output(), "");
});

test("help documents production default without contacting it", { timeout: 10_000 }, async (t) => {
  const bridge = child(["--help"]);
  t.after(async () => { if (bridge.proc.exitCode === null) bridge.proc.kill(); await bridge.closed; });
  const [code] = await bridge.closed;
  assert.equal(code, 0);
  assert.match(bridge.output(), /https:\/\/getvitamind.app\/api\/mcp\/mcp/);
  assert.equal(bridge.errors(), "");
});
