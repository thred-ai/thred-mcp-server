import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ThredApiClient } from "../api-client.js";
import { formatTranscript, formatCustomerSummary } from "../utils/formatters.js";

export function registerGetRecentCustomers(
  server: McpServer,
  apiClient: ThredApiClient
) {
  server.tool(
    "get_recent_customers",
    "Retrieve recent customer conversations, optionally filtered by AI platforms and/or date range. Useful for questions like 'what are customers from claude asking today?' or 'show me conversations from last week'.",
    {
      platforms: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by AI platform(s) the customer came from (e.g. chatgpt, claude, gemini, pplx). Only include if the user asks about specific platforms."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .max(50)
        .optional()
        .describe("Number of customers to return (default 5, max 50)"),
      startDate: z
        .number()
        .optional()
        .describe(
          "Filter customers created on or after this date (Unix timestamp in milliseconds)"
        ),
      endDate: z
        .number()
        .optional()
        .describe(
          "Filter customers created on or before this date (Unix timestamp in milliseconds)"
        ),
    },
    async ({ platforms, limit, startDate, endDate }) => {
      try {
        const results = await apiClient.getRecentCustomers(
          limit,
          platforms,
          startDate,
          endDate
        );

        if (!results || results.length === 0) {
          const platformsNote = platforms?.length ? ` from ${platforms.join(", ")}` : "";
          return {
            content: [
              {
                type: "text" as const,
                text: `No recent customers found${platformsNote}.`,
              },
            ],
          };
        }

        const customerSections = results.map((customer) => {
          const label = customer.name ?? customer.email ?? "Unknown";
          const header = `### ${label}`;
          const summary = formatCustomerSummary(customer);
          const hasTranscript =
            customer.conversation && customer.conversation.length > 0;
          const transcript = hasTranscript
            ? `\n\n#### Transcript\n\n${formatTranscript(customer.conversation!)}`
            : "";
          return `${header}\n\n${summary}${transcript}`;
        });

        const platformsNote = platforms?.length ? ` (platforms: ${platforms.join(", ")})` : "";
        return {
          content: [
            {
              type: "text" as const,
              text: `## Recent Customers${platformsNote}\n\n**Count:** ${results.length}\n\n---\n\n${customerSections.join("\n\n---\n\n")}`,
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
}
