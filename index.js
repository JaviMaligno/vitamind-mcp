#!/usr/bin/env node
/**
 * vitamind-mcp — stdio bridge to the hosted Vitamin D Explorer MCP server.
 *
 * The server itself lives at https://getvitamind.app/api/mcp/mcp and speaks Streamable
 * HTTP. Clients that only launch local stdio processes (Claude Desktop, Cursor, and the
 * MCP directories that assume an installable command) cannot talk to it directly, so
 * this bridges the two: stdio in, HTTP out.
 *
 * It holds no vitamin D logic of its own — every answer comes from the hosted server —
 * which is deliberate. A second copy of the model would drift from the app.
 */
import process from "node:process";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const PUBLIC_URL = "https://getvitamind.app/api/mcp/mcp";
const ACCOUNT_URL = "https://getvitamind.app/api/mcp-auth/mcp";

function parseArgs(argv) {
  const args = { url: process.env.VITAMIND_MCP_URL || PUBLIC_URL };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--url") args.url = argv[++i];
    else if (arg.startsWith("--url=")) args.url = arg.slice("--url=".length);
    else if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg === "--version" || arg === "-v") args.version = true;
  }
  return args;
}

const HELP = `vitamind-mcp — connect an MCP client to Vitamin D Explorer

Usage:
  npx vitamind-mcp [--url <endpoint>]

Options:
  --url <endpoint>   MCP endpoint to bridge to.
                     Default: ${PUBLIC_URL}
                     Env var: VITAMIND_MCP_URL
  -h, --help         Show this help
  -v, --version      Show the version

The default endpoint needs no account. The account endpoint (${ACCOUNT_URL})
requires OAuth, which this bridge does not implement — use mcp-remote for that:
  npx mcp-remote ${ACCOUNT_URL}

Most MCP clients can also connect to the hosted server directly, with no install at all.
See https://getvitamind.app/connect
`;

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    process.stdout.write(HELP);
    return;
  }
  if (args.version) {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    process.stdout.write(`${require("./package.json").version}\n`);
    return;
  }

  let endpoint;
  try {
    endpoint = new URL(args.url);
  } catch {
    // stderr, never stdout: stdout is the JSON-RPC channel and any stray byte on it
    // corrupts the stream for the client.
    process.stderr.write(`vitamind-mcp: invalid --url: ${args.url}\n`);
    process.exit(1);
  }

  const remote = new StreamableHTTPClientTransport(endpoint);
  const local = new StdioServerTransport();

  // Straight JSON-RPC relay in both directions. Nothing is inspected or rewritten, so
  // new tools and protocol revisions on the server need no release here.
  local.onmessage = (message) => {
    remote.send(message).catch(fail);
  };
  remote.onmessage = (message) => {
    local.send(message).catch(fail);
  };

  local.onerror = fail;
  remote.onerror = fail;

  // When either side hangs up, so does the bridge — a half-open bridge looks alive to
  // the client while silently answering nothing.
  local.onclose = () => {
    remote.close().finally(() => process.exit(0));
  };
  remote.onclose = () => {
    local.close().finally(() => process.exit(0));
  };

  await remote.start();
  await local.start();
}

function fail(error) {
  process.stderr.write(`vitamind-mcp: ${error?.message ?? error}\n`);
  process.exit(1);
}

main().catch(fail);
