// Target company list for Partner Pulse.
// Core = monitored every cycle, surfaced in the briefing.
// Bench = monitored lightly, only surfaced on major signals.

export const CORE_COMPANIES = [
  // Frontier labs
  "Anthropic",
  "OpenAI",
  "Mistral",
  "Perplexity",
  // AI infrastructure
  "Databricks",
  "Snowflake",
  "NVIDIA",
  // Commerce platforms
  "Stripe",
  "Shopify",
  // Developer platforms
  "Vercel",
  "Linear",
  "Replit",
  // Wildcard
  "Polymarket",
] as const;

export const BENCH_COMPANIES = [
  "Google",
  "Microsoft",
  "ServiceNow",
  "Glean",
  "Accenture",
  "Deloitte",
  "ThoughtWorks",
] as const;

export const ALL_COMPANIES = [...CORE_COMPANIES, ...BENCH_COMPANIES] as const;
export type Company = (typeof ALL_COMPANIES)[number];

export function isKnownCompany(name: string): name is Company {
  return ALL_COMPANIES.includes(name as Company);
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}
