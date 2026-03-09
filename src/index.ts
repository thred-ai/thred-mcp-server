#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";
import {
  ThredApiClient,
  ConversationMessage,
  CustomerChatResponse,
} from "./api-client.js";

const BASE_URL = process.env.THRED_BASE_URL;
const TRANSPORT = process.env.TRANSPORT ?? "stdio"; // "stdio" | "http"
//
// In stdio mode, the API key comes from the env var (single user).
// In HTTP mode, each client sends their own key via Authorization header.
const STATIC_API_KEY = process.env.THRED_API_KEY;

if (TRANSPORT === "stdio" && !STATIC_API_KEY) {
  console.error(
    "THRED_API_KEY environment variable is required in stdio mode."
  );
  process.exit(1);
}

// Per-session API clients for HTTP mode (sessionId → client)
const sessionClients = new Map<string, ThredApiClient>();

// Fallback client for stdio mode
const defaultClient = STATIC_API_KEY
  ? new ThredApiClient(STATIC_API_KEY, BASE_URL)
  : null;

function getClient(sessionId?: string): ThredApiClient {
  if (sessionId) {
    const client = sessionClients.get(sessionId);
    if (client) return client;
  }
  if (defaultClient) return defaultClient;
  throw new Error("No API key available. Pass your Thred API key via the Authorization header.");
}

const server = new McpServer({
  name: "thred-mcp",
  version: "1.0.0",
});

// --- Helpers -----------------------------------------------------------

function formatTranscript(conversation: ConversationMessage[]): string {
  if (conversation.length === 0) return "No conversation messages found.";

  return conversation
    .map((msg, i) => {
      const label = msg.role === "user" ? "User" : "Assistant";
      return `[${i + 1}] ${label}:\n${msg.content}`;
    })
    .join("\n\n---\n\n");
}

function formatCustomerSummary(data: CustomerChatResponse): string {
  const lines: string[] = [];

  lines.push(`**Status:** ${data.status}`);

  if (data.progress !== undefined) {
    lines.push(`**Progress:** ${data.progress}%`);
  }
  if (data.summary) {
    lines.push(`\n**Summary:**\n${data.summary}`);
  }
  if (data.insights) {
    const { mainConcerns, buyingSignals, competitorsConsidered } =
      data.insights;
    if (mainConcerns.length > 0) {
      lines.push(
        `\n**Main Concerns:**\n${mainConcerns.map((c) => `- ${c.signal} (turn ${c.turn}, priority ${c.priority})`).join("\n")}`
      );
    }
    if (buyingSignals.length > 0) {
      lines.push(
        `\n**Buying Signals:**\n${buyingSignals.map((s) => `- ${s.signal} (turn ${s.turn}, priority ${s.priority})`).join("\n")}`
      );
    }
    if (competitorsConsidered.length > 0) {
      lines.push(
        `\n**Competitors Considered:**\n${competitorsConsidered.map((c) => `- ${c.signal} (turn ${c.turn})`).join("\n")}`
      );
    }
  }

  return lines.join("\n");
}

// --- Tools -------------------------------------------------------------

server.tool(
  "get_transcript_by_email",
  "Retrieve the conversation transcript for a Thred customer by their email address. Returns the full conversation in chronological order with user queries and assistant responses.",
  { email: z.string().email().describe("Customer email address") },
  async ({ email }, extra) => {
    try {
      const client = getClient(extra.sessionId);
      const data = await client.getCustomerByEmail(email);

      if (!data.conversation || data.conversation.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No conversation transcript found for ${email}. Chat status: ${data.status}`,
            },
          ],
        };
      }

      const transcript = formatTranscript(data.conversation);
      const summary = formatCustomerSummary(data);

      return {
        content: [
          {
            type: "text" as const,
            text: `## Conversation Transcript for ${email}\n\n${summary}\n\n---\n\n## Transcript\n\n${transcript}`,
          },
        ],
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_transcript_by_id",
  "Retrieve the conversation transcript for a Thred customer by their customer ID. Returns the full conversation in chronological order with user queries and assistant responses.",
  { customerId: z.string().min(1).describe("Thred customer ID") },
  async ({ customerId }, extra) => {
    try {
      const client = getClient(extra.sessionId);
      const data = await client.getCustomerById(customerId);

      if (!data.conversation || data.conversation.length === 0) {
        return {
          content: [
            {
              type: "text" as const,
              text: `No conversation transcript found for customer ${customerId}. Chat status: ${data.status}`,
            },
          ],
        };
      }

      const transcript = formatTranscript(data.conversation);
      const summary = formatCustomerSummary(data);

      return {
        content: [
          {
            type: "text" as const,
            text: `## Conversation Transcript for Customer ${customerId}\n\n${summary}\n\n---\n\n## Transcript\n\n${transcript}`,
          },
        ],
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "get_customer_insights",
  "Retrieve insights, buying signals, concerns, and suggestions for a Thred customer. Lookup by email or customer ID.",
  {
    email: z
      .string()
      .email()
      .optional()
      .describe("Customer email address (provide email or customerId)"),
    customerId: z
      .string()
      .optional()
      .describe("Thred customer ID (provide email or customerId)"),
  },
  async ({ email, customerId }, extra) => {
    if (!email && !customerId) {
      return {
        content: [
          {
            type: "text" as const,
            text: "Error: Provide either an email or customerId.",
          },
        ],
        isError: true,
      };
    }

    try {
      const client = getClient(extra.sessionId);
      const data = email
        ? await client.getCustomerByEmail(email)
        : await client.getCustomerById(customerId!);

      const label = email ?? customerId;
      const summary = formatCustomerSummary(data);

      return {
        content: [
          {
            type: "text" as const,
            text: `## Customer Insights for ${label}\n\n${summary}`,
          },
        ],
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        content: [{ type: "text" as const, text: `Error: ${message}` }],
        isError: true,
      };
    }
  }
);

server.tool(
  "check_backend_health",
  "Check whether the Thred backend service is reachable and healthy.",
  {},
  async (_args, extra) => {
    try {
      const client = getClient(extra.sessionId);
      const result = await client.healthCheck();
      return {
        content: [
          {
            type: "text" as const,
            text: `Backend is healthy. Status: ${result.status}`,
          },
        ],
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      return {
        content: [
          {
            type: "text" as const,
            text: `Backend health check failed: ${message}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// --- Start -------------------------------------------------------------

async function startStdio() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

async function startHttp() {
  const app = express();
  app.use(express.json());

  const transports = new Map<string, StreamableHTTPServerTransport>();

  function extractApiKey(req: express.Request): string | undefined {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) return auth.substring(7);
    return undefined;
  }

  app.post("/v1", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    let transport: StreamableHTTPServerTransport;

    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
    } else {
      const apiKey = extractApiKey(req);
      if (!apiKey) {
        res.status(401).json({
          error: "Authorization required",
          message: "Pass your Thred API key as: Authorization: Bearer <key>",
        });
        return;
      }

      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
      });
      await server.connect(transport);

      const newSessionId =
        (transport as unknown as { sessionId: string }).sessionId;
      if (newSessionId) {
        transports.set(newSessionId, transport);
        sessionClients.set(newSessionId, new ThredApiClient(apiKey, BASE_URL));
      }
    }

    await transport.handleRequest(req, res, req.body);
  });

  app.get("/v1", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (!sessionId || !transports.has(sessionId)) {
      res.status(400).json({ error: "Invalid or missing session ID" });
      return;
    }
    const transport = transports.get(sessionId)!;
    await transport.handleRequest(req, res);
  });

  app.delete("/v1", async (req, res) => {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;
    if (sessionId && transports.has(sessionId)) {
      const transport = transports.get(sessionId)!;
      await transport.handleRequest(req, res);
      transports.delete(sessionId);
      sessionClients.delete(sessionId);
    } else {
      res.status(400).json({ error: "Invalid or missing session ID" });
    }
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", transport: "http" });
  });

  const port = parseInt(process.env.PORT ?? "3000", 10);
  app.listen(port, () => {
    console.log(`Thred MCP server (HTTP) listening on port ${port}`);
  });
}

async function main() {
  if (TRANSPORT === "http") {
    await startHttp();
  } else {
    await startStdio();
  }
}

main().catch((error) => {
  console.error("Fatal error starting MCP server:", error);
  process.exit(1);
});
