const DEFAULT_BASE_URL = "http://localhost:8080";

export interface FormattedConversation {
  platform: string;
  platformLabel: string;
  date: string;
  label: string;
  insights: {
    buyingSignals: { signal: string; priority: string }[];
    mainConcerns: { signal: string; priority: string }[];
    competitorsConsidered: { signal: string }[];
  };
  queries: {
    query: string;
    time: string;
    turnNumber: number;
  }[];
  summary?: string;
  link: string;
}

export interface ConversationsResponse {
  customer: {
    id: string;
    name: string;
    email: string;
    company?: string;
  };
  conversations: FormattedConversation[];
}

export interface CompanyConversationsResponse {
  company: string;
  customers: ConversationsResponse[];
}

export interface PaginatedRecentResponse {
  data: ConversationsResponse[];
  continueCursor: string;
  isDone: boolean;
}

export class ThredApiClient {
  private baseUrl: string;
  private apiKey: string;

  constructor(apiKey: string, baseUrl?: string) {
    this.apiKey = apiKey;
    this.baseUrl = (baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  private async request<T>(path: string): Promise<T> {
    const url = `${this.baseUrl}/v1${path}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const message = (body as any)?.message ?? (body as any)?.error ?? response.statusText;
      throw new Error(`API error ${response.status}: ${message}`);
    }

    return response.json() as Promise<T>;
  }

  async getConversationsByEmail(email: string): Promise<ConversationsResponse> {
    return this.request<ConversationsResponse>(
      `/conversations?email=${encodeURIComponent(email)}`
    );
  }

  async getConversationsById(customerId: string): Promise<ConversationsResponse> {
    return this.request<ConversationsResponse>(
      `/conversations?customerId=${encodeURIComponent(customerId)}`
    );
  }

  async getConversationsByCompany(companyName: string): Promise<CompanyConversationsResponse> {
    return this.request<CompanyConversationsResponse>(
      `/conversations/by-company?name=${encodeURIComponent(companyName)}`
    );
  }

  async getRecentConversationsPage(
    limit?: number,
    platforms?: string[],
    paginationCursor?: string,
  ): Promise<PaginatedRecentResponse> {
    const params = new URLSearchParams();
    if (limit !== undefined) params.set("limit", String(limit));
    if (platforms?.length) params.set("platforms", platforms.join(","));
    if (paginationCursor) params.set("paginationCursor", paginationCursor);
    const qs = params.toString();
    return this.request<PaginatedRecentResponse>(
      `/conversations/recent${qs ? `?${qs}` : ""}`
    );
  }

  async getRecentConversations(
    limit?: number,
    platforms?: string[],
  ): Promise<ConversationsResponse[]> {
    const cap = limit ?? 5;
    const allResults: ConversationsResponse[] = [];
    let cursor: string | undefined;

    while (true) {
      const page = await this.getRecentConversationsPage(cap, platforms, cursor);
      allResults.push(...page.data);

      if (page.isDone || allResults.length >= cap) break;
      cursor = page.continueCursor;
    }

    return allResults.slice(0, cap);
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>("/health");
  }
}
