import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ThredApiClient, type RecentCustomerEntry } from "../api-client.js";
import { formatRecentCustomerEntry } from "../utils/formatters.js";

export function registerGetRecentCustomers(
  server: McpServer,
  apiClient: ThredApiClient
) {
  server.tool(
    "get_recent_customers",
    "Retrieve recent customers with all completed conversations each: name and company, firmographic sources (customer/enriched data), plaintext transcript (user queries and assistant responses, not markdown), and buying signals/concerns/competitors. Optionally filter by AI platform. Pagination: this tool automatically follows the API continuation cursor across multiple pages until it gathers up to the requested limit of customers or runs out of data; raise the limit parameter for more customers in one run, or invoke the tool again if the user needs additional batches beyond that.",
    {
      platforms: z
        .array(z.string())
        .optional()
        .describe(
          "Filter by AI platform(s) (e.g. chatgpt, claude, gemini, pplx). Only include if the user asks about specific platforms."
        ),
      limit: z
        .number()
        .int()
        .min(1)
        .optional()
        .describe(
          "Number of customers to return (default 3)."
        ),
    },
    async ({ platforms, limit }) => {
      try {
        const PAGE_SIZE = 25;
        const cap = limit;
        const allResults: RecentCustomerEntry[] = [];
        let cursor: string | undefined;

        while (true) {
          const page = await apiClient.getRecentConversationsPage(
            PAGE_SIZE,
            platforms,
            cursor
          );
          allResults.push(...page.data);

          if (page.isDone || (cap && allResults.length >= cap)) break;
          cursor = page.continueCursor;
        }

        const results = allResults.slice(0, cap);

        if (results.length === 0) {
          return {
            content: [
              {
                type: "text" as const,
                text: "No recent conversations found.",
              },
            ],
          };
        }

        const sections = results.map((entry) => formatRecentCustomerEntry(entry));

        return {
          content: [
            {
              type: "text" as const,
              text: sections.join("\n\n==========\n\n"),
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
