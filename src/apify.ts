// Apify standby entrypoint: serves the Kartverket MCP server over Streamable HTTP
// at POST /mcp and charges a pay-per-event fee for each tool call.
//
// This file is only used inside the Apify Actor (see .actor/). It is NOT part of
// the npm stdio binary, and its dependencies (apify, express, cors) are declared
// as optionalDependencies so a plain `npx @nor-data/kartverket-mcp` install stays lean.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Actor, log } from "apify";
import cors from "cors";
import express, { type Request, type Response } from "express";

import { registerTools } from "./tools.js";

await Actor.init();

let chargedStart = false;

function buildServer(): McpServer {
  const server = new McpServer({ name: "drist-kartverket-mcp", version: "0.5.0" });
  registerTools(server, async () => {
    // Charge once per Actor run for startup, then once per tool call.
    if (!chargedStart) {
      chargedStart = true;
      await Actor.charge({ eventName: "actor-start" });
    }
    await Actor.charge({ eventName: "tool-call" });
  });
  return server;
}

const app = express();
app.use(express.json());
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Mcp-Session-Id"],
  }),
);

// Apify standby readiness probe
app.get("/", (req: Request, res: Response) => {
  if (req.headers["x-apify-container-server-readiness-probe"]) {
    res.end("ok\n");
    return;
  }
  res.status(404).end();
});

app.post("/mcp", async (req: Request, res: Response) => {
  const server = buildServer();
  try {
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
  } catch (error) {
    log.error("Error handling MCP request", { error });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: { code: -32603, message: "Internal server error" },
        id: null,
      });
    }
  }
});

const methodNotAllowed = (_req: Request, res: Response) => {
  res.writeHead(405).end(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code: -32000, message: "Method not allowed." },
      id: null,
    }),
  );
};
app.get("/mcp", methodNotAllowed);
app.delete("/mcp", methodNotAllowed);

const PORT = process.env.ACTOR_STANDBY_PORT ? parseInt(process.env.ACTOR_STANDBY_PORT, 10) : 3000;
app.listen(PORT, () => {
  log.info(`Kartverket MCP server listening on port ${PORT}`);
});

process.on("SIGINT", async () => {
  await Actor.exit();
});
