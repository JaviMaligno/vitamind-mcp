// Preloaded only by the offline child-process tests. No fetch delegates to the
// network: unexpected endpoints fail closed before any connection can be made.
const endpoint = "https://fixture.invalid/mcp";

globalThis.fetch = async (input, options = {}) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url !== endpoint && url !== `${endpoint}/failure`) {
    throw new Error(`offline fixture rejected endpoint: ${url}`);
  }
  if (url.endsWith("/failure")) throw new Error("synthetic upstream failure");

  const method = options.method ?? "GET";
  if (method === "GET") return new Response(null, { status: 405 });
  if (method === "DELETE") return new Response(null, { status: 200 });
  if (method !== "POST") throw new Error(`unexpected method: ${method}`);
  const message = JSON.parse(options.body);
  if (message.id === undefined) return new Response(null, { status: 202 });

  let result;
  if (message.method === "initialize") {
    result = {
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "synthetic-upstream", version: "0" },
    };
  } else if (message.method === "tools/list") {
    result = { tools: [{ name: "fixture_tool", description: "Offline fixture", inputSchema: { type: "object" } }] };
  } else if (message.method === "tools/call") {
    result = { content: [{ type: "text", text: JSON.stringify(message.params) }] };
  } else {
    return Response.json({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: "synthetic method missing" } });
  }
  return Response.json({ jsonrpc: "2.0", id: message.id, result }, {
    headers: { "mcp-session-id": "offline-session" },
  });
};
