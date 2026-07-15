// Tavily news fetcher for Partner Pulse.
// Pulls raw signals about a target company using a multi-query strategy
// designed to catch the signal categories in our v2 taxonomy.
//
// Docs: https://docs.tavily.com/

import { config } from "dotenv";
config({ path: ".env.local" });

const TAVILY_URL = "https://api.tavily.com/search";

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
  published_date?: string;
}

interface TavilyResponse {
  query: string;
  results: TavilyResult[];
  answer?: string;
  response_time?: number;
}

/**
 * Single Tavily search call.
 */
async function tavilySearch(
  query: string,
  days: number = 7,
  maxResults: number = 8
): Promise<TavilyResult[]> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) {
    throw new Error(
      "TAVILY_API_KEY not set. Add it to .env.local (copy from .env.local.example)."
    );
  }

  const body = {
    api_key: apiKey,
    query,
    topic: "news",
    search_depth: "advanced",
    days,
    max_results: maxResults,
    include_answer: false,
    include_raw_content: false,
  };

  const res = await fetch(TAVILY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Tavily error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as TavilyResponse;
  return data.results;
}

/**
 * Multi-query strategy: run several targeted searches per company so
 * we catch different signal types in the taxonomy, then dedupe by URL.
 *
 * Query design:
 *   1. Broad — catch any major news (positioning, exec voice, customer wins)
 *   2. Partnership/product — alliances, integrations, launches
 *   3. People — exec hires, BD leadership moves
 *   4. Capital/workforce — funding, layoffs, acquisitions
 *
 * Each search uses 1-2 Tavily credits. Free tier (1000/mo) handles all
 * 20 companies × 4 queries × ~4 cycles/month easily.
 */
export async function fetchSignalsForCompany(
  company: string
): Promise<TavilyResult[]> {
  const queries = [
    `${company}`,
    `${company} partnership OR integration OR alliance OR launches OR acquires`,
    `${company} hires OR appoints OR new head of OR chief partnerships officer`,
    `${company} layoffs OR funding round OR acquisition OR IPO`,
  ];

  const allResults = await Promise.all(
    queries.map((q) => tavilySearch(q, 7, 8))
  );

  // Dedupe by URL, preserve highest Tavily score
  const byUrl = new Map<string, TavilyResult>();
  for (const results of allResults) {
    for (const r of results) {
      const existing = byUrl.get(r.url);
      if (!existing || r.score > existing.score) {
        byUrl.set(r.url, r);
      }
    }
  }

  const deduped = Array.from(byUrl.values());
  deduped.sort((a, b) => b.score - a.score);
  return deduped;
}
