import { Hono } from "hono";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { ThredApiClient } from "./api-client.js";
import { registerTools } from "./tools/index.js";
import type { Bindings } from "./types/env.js";

type Env = { Bindings: Bindings };

const app = new Hono<Env>();

const sessions = new Map<
  string,
  {
    transport: WebStandardStreamableHTTPServerTransport;
    server: McpServer;
  }
>();

function createServer(apiClient: ThredApiClient): McpServer {
  const server = new McpServer({
    name: "thred-mcp",
    version: "1.0.0",
  });
  registerTools(server, apiClient);
  return server;
}

function extractApiKey(
  authHeader: string | undefined,
  url: string
): string | undefined {
  if (authHeader?.startsWith("Bearer ")) return authHeader.substring(7);
  const parsed = new URL(url);
  return parsed.searchParams.get("apiKey") ?? undefined;
}

app.all("/v1", async (c) => {
  const sessionId = c.req.header("mcp-session-id");

  if (sessionId && sessions.has(sessionId)) {
    return sessions.get(sessionId)!.transport.handleRequest(c.req.raw);
  }

  if (sessionId) {
    return c.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32600,
          message: "Session not found. Please reinitialize.",
        },
        id: null,
      },
      404
    );
  }

  if (c.req.method !== "POST") {
    return c.json({ error: "Method not allowed without session" }, 405);
  }

  const apiKey = extractApiKey(
    c.req.header("authorization"),
    c.req.url
  );
  if (!apiKey) {
    return c.json(
      {
        error: "Authorization required",
        message: "Pass your Thred API key as: Authorization: Bearer <key>",
      },
      401
    );
  }

  const client = new ThredApiClient(apiKey, c.env.THRED_BASE_URL);
  const server = createServer(client);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => crypto.randomUUID(),
    onsessioninitialized: (id) => {
      sessions.set(id, { transport, server });
    },
    onsessionclosed: (id) => {
      sessions.delete(id);
    },
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});

app.get("/health", (c) => {
  return c.json({ status: "ok", transport: "http" });
});

app.get("/", (c) => {
  return c.json({
    service: "Thred MCP Server",
    version: "1.0.0",
    status: "running",
    endpoints: {
      health: "/health",
      mcp: "POST /v1",
    },
  });
});

app.notFound((c) => {
  return c.json(
    {
      error: "Not found",
      message: `Route ${c.req.method} ${c.req.path} not found`,
    },
    404
  );
});

export default app;
