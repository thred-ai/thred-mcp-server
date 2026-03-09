const DEFAULT_BASE_URL = "http://localhost:8080";

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatInsightItem {
  signal: string;
  turn: number;
  location: "query" | "response";
  priority: number;
}

export interface ChatInsights {
  mainConcerns: ChatInsightItem[];
  buyingSignals: ChatInsightItem[];
  competitorsConsidered: ChatInsightItem[];
}

export interface CustomerChatResponse {
  status: "pending" | "processing" | "completed" | "failed";
  leadData?: Record<string, unknown>;
  enrichedData?: Record<string, unknown>;
  sources?: Array<Record<string, unknown>>;
  insights?: ChatInsights;
  suggestions?: string[];
  turnCount?: number;
  summary?: string;
  conversation?: ConversationMessage[];
  progress?: number;
}

export interface CompanyResponse {
  company: string;
  results: CustomerChatResponse[];
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

  async getCustomerByEmail(email: string): Promise<CustomerChatResponse> {
    return this.request<CustomerChatResponse>(
      `/customers?email=${encodeURIComponent(email)}`
    );
  }

  async getCustomerById(customerId: string): Promise<CustomerChatResponse> {
    return this.request<CustomerChatResponse>(
      `/customers/${encodeURIComponent(customerId)}`
    );
  }

  async getCustomersByCompany(companyName: string): Promise<CompanyResponse> {
    return this.request<CompanyResponse>(
      `/customers/by-company?name=${encodeURIComponent(companyName)}`
    );
  }

  async healthCheck(): Promise<{ status: string }> {
    return this.request<{ status: string }>("/health");
  }
}
