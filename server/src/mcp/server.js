/**
 * RaahiGo MCP server (official @modelcontextprotocol/sdk). Exposes READ-ONLY, public tools so other AI
 * clients (Claude Desktop, IDE agents) can search buses, plan journeys and look up policy.
 * It never exposes anything that books, pays, cancels, locks seats or reads a user's private data.
 *
 * Run (stdio):  npm run mcp      (needs the same DB env as the API)
 */
const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { z } = require("zod");
const { runTool, defaultDeps } = require("../services/ai/agent/tools");

const PUBLIC_TOOLS = ["search_buses", "find_journey", "policy_lookup"];

function createServer(deps) {
  const server = new McpServer({ name: "raahigo", version: "1.0.0" });
  const ctx = () => ({ user: null, deps: deps || defaultDeps() });
  const reply = (out) => ({ content: [{ type: "text", text: JSON.stringify(out.data) }], isError: Boolean(out.data?.error) });

  server.registerTool("search_buses", {
    description: "Search RaahiGo buses between two Indian cities on a date. Read-only.",
    inputSchema: { from: z.string().max(60), to: z.string().max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), maxPrice: z.number().positive().max(100000).optional() },
  }, async (args) => reply(await runTool("search_buses", args, ctx())));

  server.registerTool("find_journey", {
    description: "Find connections and nearby dates when a route is sold out. Read-only; each leg is booked separately.",
    inputSchema: { from: z.string().max(60), to: z.string().max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() },
  }, async (args) => reply(await runTool("find_journey", args, ctx())));

  server.registerTool("policy_lookup", {
    description: "Look up RaahiGo policy (cancellations, refunds, seat holds, payments). Returns nothing rather than guessing.",
    inputSchema: { question: z.string().max(300) },
  }, async (args) => reply(await runTool("policy_lookup", args, ctx())));

  return server;
}

async function main() {
  const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
  const mongoose = require("mongoose");
  require("dotenv").config();
  await mongoose.connect(process.env.MONGODB_URI);
  await createServer().connect(new StdioServerTransport());
}

if (require.main === module) main().catch((e) => { console.error(e); process.exit(1); });
module.exports = { createServer, PUBLIC_TOOLS };
