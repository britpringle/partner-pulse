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

// ---- Framework tiers (Partnership Prioritization Framework, Section 2) ----
// Tier reflects how much partnership investment a company currently warrants:
//   1 = Transactional    (light touch: marketplace, reseller, co-marketing)
//   2 = Strategic        (a real co-selling motion, named owners, joint GTM)
//   3 = Transformational (joint product and roadmap, exec sponsor, engineering)
//
// These are illustrative, set from the vantage of a partnerships lead at a
// developer and AI platform, using only public signals. They demonstrate the
// method, not any company's real strategy. Edit freely: change a company's
// number to re-tier it.
export type Tier = 1 | 2 | 3;

export const TIER_LABELS: Record<Tier, string> = {
  1: "Transactional",
  2: "Strategic",
  3: "Transformational",
};

export const COMPANY_TIERS: Record<string, Tier> = {
  Anthropic: 3,
  OpenAI: 3,
  Mistral: 1,
  Perplexity: 1,
  Databricks: 2,
  Snowflake: 2,
  NVIDIA: 1,
  Stripe: 2,
  Shopify: 1,
  Vercel: 2,
  Linear: 1,
  Replit: 1,
  Polymarket: 1,
};

export function tierOf(name: string): Tier {
  return COMPANY_TIERS[name] ?? 1;
}

export function isKnownCompany(name: string): name is Company {
  return ALL_COMPANIES.includes(name as Company);
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}
