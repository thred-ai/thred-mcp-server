import {
  FormattedConversation,
  ConversationsResponse,
  RecentCustomerConversation,
  RecentCustomerEntry,
} from "../api-client.js";

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: "ChatGPT",
  gemini: "Gemini",
  pplx: "Perplexity",
  claude: "Claude",
};

function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform;
}

function stringifyMetadata(metadata: unknown, maxLen = 4000): string {
  try {
    const s = JSON.stringify(metadata, null, 2);
    if (s.length <= maxLen) return s;
    return `${s.slice(0, maxLen)}\n… (truncated)`;
  } catch {
    return String(metadata);
  }
}

/** One conversation block for GET /conversations/recent lean payload. */
export function formatRecentCustomerConversation(
  conv: RecentCustomerConversation
): string {
  const lines: string[] = [];
  lines.push(`### ${platformLabel(conv.platform)} — ${conv.date}`);

  if (conv.summary) {
    lines.push(`\n**Summary:** ${conv.summary}`);
  }

  if (conv.sources.length > 0) {
    lines.push(`\n**Firmographics (sources):**`);
    for (const s of conv.sources) {
      lines.push(`- **${s.type}** (${s.id}) @ ${new Date(s.timestamp).toISOString()}`);
      lines.push(`  \`\`\`json\n${stringifyMetadata(s.metadata, 3000)}\n  \`\`\``);
    }
  }

  const { buyingSignals, mainConcerns, competitorsConsidered } = conv.insights;

  if (buyingSignals.length > 0) {
    lines.push(`\n**Buying Signals:**`);
    for (const s of buyingSignals) {
      lines.push(`- ${s.signal} (${s.priority} priority)`);
    }
  }

  if (mainConcerns.length > 0) {
    lines.push(`\n**Concerns:**`);
    for (const s of mainConcerns) {
      lines.push(`- ${s.signal} (${s.priority} priority)`);
    }
  }

  if (competitorsConsidered.length > 0) {
    lines.push(`\n**Competitors Discussed:**`);
    for (const s of competitorsConsidered) {
      lines.push(`- ${s.signal}`);
    }
  }

  if (conv.transcript.length > 0) {
    lines.push(`\n**Transcript (plaintext):**`);
    for (const t of conv.transcript) {
      lines.push(`\n**Turn ${t.turnNumber} — Query:**\n${t.query}`);
      if (t.response !== undefined && t.response !== "") {
        lines.push(`\n**Turn ${t.turnNumber} — Response:**\n${t.response}`);
      }
    }
  }

  return lines.join("\n");
}

/** Full output for one customer from recent-customers API. */
export function formatRecentCustomerEntry(entry: RecentCustomerEntry): string {
  const header = [
    `## ${entry.customer.name}`,
    entry.customer.company ? `Company: ${entry.customer.company}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  if (entry.conversations.length === 0) {
    return `${header}\n\n_No completed conversations._`;
  }

  const blocks = entry.conversations.map((c) =>
    formatRecentCustomerConversation(c)
  );
  return `${header}\n\n${blocks.join("\n\n---\n\n")}`;
}

export function formatConversationEntry(conv: FormattedConversation, customerName?: string): string {
  const lines: string[] = [];

  lines.push(`### ${conv.label}`);
  if (customerName) {
    lines.push(`**${customerName}**`);
  }

  if (conv.summary) {
    lines.push(`\n${conv.summary}`);
  }

  const { buyingSignals, mainConcerns, competitorsConsidered } = conv.insights;

  if (buyingSignals.length > 0) {
    lines.push(`\n**Buying Signals:**`);
    for (const s of buyingSignals) {
      lines.push(`- ${s.signal} (${s.priority} priority)`);
    }
  }

  if (mainConcerns.length > 0) {
    lines.push(`\n**Concerns:**`);
    for (const s of mainConcerns) {
      lines.push(`- ${s.signal} (${s.priority} priority)`);
    }
  }

  if (competitorsConsidered.length > 0) {
    lines.push(`\n**Competitors Discussed:**`);
    for (const s of competitorsConsidered) {
      lines.push(`- ${s.signal}`);
    }
  }

  if (conv.queries.length > 0) {
    lines.push(`\n**Queries:**`);
    for (const q of conv.queries) {
      lines.push(`- ${q.time}: "${q.query}"`);
    }
  }

  lines.push(`\n[View transcript](${conv.link})`);

  return lines.join("\n");
}

export function formatConversationsResponse(data: ConversationsResponse): string {
  if (data.conversations.length === 0) {
    return `No completed conversations found for ${data.customer.name}.`;
  }

  const sections = data.conversations.map((conv) =>
    formatConversationEntry(conv)
  );

  const header = [
    `**${data.customer.name}**`,
    data.customer.company ? `Company: ${data.customer.company}` : null,
    `Email: ${data.customer.email}`,
  ].filter(Boolean).join(" | ");

  return `${header}\n\n---\n\n${sections.join("\n\n---\n\n")}`;
}
