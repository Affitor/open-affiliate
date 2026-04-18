/**
 * OpenAffiliate SDK
 *
 * Programmatic access to the OpenAffiliate registry.
 *
 * @example
 * ```ts
 * import { OpenAffiliate } from '@openaffiliate/sdk'
 *
 * const oa = new OpenAffiliate()
 * const results = await oa.search('database', { type: 'recurring' })
 * const program = await oa.get('vercel')
 * ```
 */

const DEFAULT_API = "https://openaffiliate.dev";

export interface Commission {
  type: "recurring" | "one-time" | "tiered" | "hybrid";
  rate: string | number;
  currency: string;
  duration?: string | null;
  conditions?: string | null;
}

export interface Payout {
  minimum: number;
  currency?: string;
  frequency: string;
  methods?: string[];
}

export interface Program {
  slug: string;
  name: string;
  url: string;
  category: string;
  commission: Commission;
  cookieDays: number;
  payout: Payout;
  description: string;
  shortDescription: string;
  tags: string[];
  verified: boolean;
  agentPrompt: string;
  agentKeywords?: string[];
  agentUseCases?: string[];
  signupUrl?: string;
  approval?: string;
  approvalTime?: string;
  restrictions?: string[];
  attribution?: string;
  trackingMethod?: string;
  network?: string | null;
  submittedBy: string;
  createdAt: string;
}

export interface Category {
  name: string;
  count: number;
}

export interface SearchOptions {
  category?: string;
  type?: "recurring" | "one-time" | "tiered";
  verified?: boolean;
}

export interface OpenAffiliateConfig {
  apiBase?: string;
}

export class OpenAffiliate {
  private apiBase: string;

  constructor(config?: OpenAffiliateConfig) {
    this.apiBase = (config?.apiBase || DEFAULT_API).replace(/\/$/, "");
  }

  private async fetch<T>(path: string): Promise<T> {
    const res = await fetch(`${this.apiBase}${path}`);
    if (!res.ok) {
      throw new Error(`OpenAffiliate API error: ${res.status} ${res.statusText}`);
    }
    return res.json() as Promise<T>;
  }

  /** Search programs by keyword with optional filters */
  async search(query?: string, options?: SearchOptions): Promise<Program[]> {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (options?.category) params.set("category", options.category);
    if (options?.type) params.set("type", options.type);
    if (options?.verified) params.set("verified", "true");

    const data = await this.fetch<{ programs: Program[] }>(
      `/api/programs?${params}`
    );
    return data.programs;
  }

  /** Get full program details by slug */
  async get(slug: string): Promise<Program | null> {
    try {
      return await this.fetch<Program>(`/api/programs/${slug}`);
    } catch {
      return null;
    }
  }

  /** List all categories with program counts */
  async categories(): Promise<Category[]> {
    const data = await this.fetch<{ categories: Category[] }>(
      "/api/categories"
    );
    return data.categories;
  }

  /** Get all programs (no filter) */
  async all(): Promise<Program[]> {
    return this.search();
  }
}

// Convenience functions for quick one-off usage
const defaultClient = new OpenAffiliate();

export const searchPrograms = defaultClient.search.bind(defaultClient);
export const getProgram = defaultClient.get.bind(defaultClient);
export const listCategories = defaultClient.categories.bind(defaultClient);
export const allPrograms = defaultClient.all.bind(defaultClient);
