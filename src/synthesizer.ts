// Stage 3: synthesizer.
//
// Classified signals often cover the same underlying event from multiple
// outlets (a funding round reported by Bloomberg, FT, and Reuters within
// a few days, worded three different ways). This stage clusters those
// duplicates, picks one canonical signal per event, and applies a
// corroboration multiplier so a well-corroborated story outranks a
// single-source one at the same base score.
//
// Clustering is a heuristic, not a model call: two signals are treated as
// the same event if they share a category, fall within a time window of
// each other, AND share at least one non-generic title keyword. All three
// have to hold — category+window alone is too loose (unrelated stories
// about the same company cluster in the same week), and keyword overlap
// alone is too loose in the other direction (generic words like "deal" or
// "AI" show up everywhere in this beat). See README for tuning notes.

import type { ClassifiedSignal } from "./classifier.js";
import { THRESHOLD } from "./classifier.js";

const CLUSTER_WINDOW_DAYS = 6;
const MIN_QUALITY_FOR_CORROBORATION = 0.8;

// Two signals sharing the same PRIMARY category is strong topical
// evidence — one matching keyword is enough to treat them as one event.
// Two signals that only overlap via a secondary category is weaker
// evidence (it's a much looser net), so we require more keyword
// agreement before merging them.
const MIN_SHARED_KEYWORDS_SAME_PRIMARY = 1;
const MIN_SHARED_KEYWORDS_SECONDARY_ONLY = 2;

// Generic words that show up across unrelated stories in this beat and
// would otherwise cause false-positive clusters (e.g. two different
// "deal" stories, or two stories that both happen to say "AI").
const STOPWORDS = new Set([
  // basic English stopwords
  "the", "a", "an", "to", "of", "in", "on", "at", "for", "and", "or",
  "with", "its", "it's", "is", "are", "was", "were", "this", "that", "as",
  "by", "from", "over", "up", "down", "than", "more", "now", "just", "new",
  "after", "before", "into", "out", "about", "amid", "amidst", "could",
  "can", "may", "might", "will", "would", "has", "have", "had", "be",
  "been", "being", "not", "no", "so", "if", "but", "said", "you", "your",
  // generic news/business verbs that recur across unrelated stories
  "deal", "deals", "signs", "signed", "signing", "launch", "launches",
  "launched", "launching", "announce", "announces", "announced",
  "announcing", "report", "reports", "reported", "reporting", "says",
  "say", "saying", "according", "considering", "weighs", "weighing",
  "plans", "plan", "planning", "talks", "talk", "raises", "raising",
  "raise", "news", "update", "updates",
  // bare magnitude/currency words — recur across unrelated dollar-amount
  // stories ("$1.8 billion cloud deal" vs "$30 billion raise") and aren't
  // distinguishing on their own; the actual figures (30, 900, 1.8, 50b)
  // still pass through as tokens.
  "billion", "million", "trillion", "bn", "usd", "dollars",
  // industry-generic terms — "AI" shows up in nearly every signal in this
  // system, and "OpenAI" shows up constantly as a comparison point in any
  // frontier-lab company's coverage, neither is distinguishing on its own
  "ai", "openai", "it", "tools",
]);

function stripSourceSuffix(title: string): string {
  const parts = title.split(" - ");
  if (parts.length > 1) {
    const tail = parts[parts.length - 1];
    if (tail.trim().split(/\s+/).length <= 3) {
      return parts.slice(0, -1).join(" - ");
    }
  }
  return title;
}

function keywordsOf(title: string, company: string): Set<string> {
  const cleaned = stripSourceSuffix(title)
    .toLowerCase()
    // Strip possessive "'s" BEFORE dropping apostrophes generally, so
    // "Anthropic's" normalizes to "anthropic" (caught by the company-token
    // filter below) instead of "anthropics" (a stray token that would
    // otherwise falsely "match" every other headline's possessive form).
    .replace(/['’]s\b/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9$%.\s]/g, " ");
  const companyTokens = new Set(company.toLowerCase().split(/\s+/));
  const tokens = cleaned
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 2 && !STOPWORDS.has(t) && !companyTokens.has(t));
  return new Set(tokens);
}

function categorySetOf(c: ClassifiedSignal): Set<number> {
  return new Set([c.primary_category, ...c.secondary_categories]);
}

function daysApart(a?: string, b?: string): number {
  if (!a || !b) return Infinity;
  const da = new Date(a).getTime();
  const db = new Date(b).getTime();
  if (Number.isNaN(da) || Number.isNaN(db)) return Infinity;
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
}

function sameEvent(
  a: ClassifiedSignal,
  b: ClassifiedSignal,
  kwA: Set<string>,
  kwB: Set<string>
): boolean {
  const catsA = categorySetOf(a);
  const sharedCategory = [...categorySetOf(b)].some((c) => catsA.has(c));
  if (!sharedCategory) return false;

  if (daysApart(a.signal.published_date, b.signal.published_date) > CLUSTER_WINDOW_DAYS) {
    return false;
  }

  const samePrimary = a.primary_category === b.primary_category;
  const minShared = samePrimary
    ? MIN_SHARED_KEYWORDS_SAME_PRIMARY
    : MIN_SHARED_KEYWORDS_SECONDARY_ONLY;

  let shared = 0;
  for (const k of kwA) if (kwB.has(k)) shared++;
  return shared >= minShared;
}

// Minimal union-find for connected-component clustering.
class DSU {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[ra] = rb;
  }
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function multiplierFor(corroborationCount: number): number {
  if (corroborationCount >= 4) return 1.3;
  if (corroborationCount === 3) return 1.25;
  if (corroborationCount === 2) return 1.15;
  return 1.0;
}

export interface BriefingItem {
  cluster_size: number;
  corroboration_count: number;
  corroboration_multiplier: number;
  final_composite: number;
  above_threshold: boolean;
  canonical: ClassifiedSignal;
  supporting: { url: string; domain: string; source_quality: number }[];
}

export interface Briefing {
  above: BriefingItem[];
  below: BriefingItem[];
}

export function synthesize(classified: ClassifiedSignal[]): Briefing {
  const n = classified.length;
  const kws = classified.map((c) => keywordsOf(c.signal.title, c.company));
  const dsu = new DSU(n);

  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (sameEvent(classified[i], classified[j], kws[i], kws[j])) {
        dsu.union(i, j);
      }
    }
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = dsu.find(i);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(i);
  }

  const items: BriefingItem[] = [];
  for (const idxs of groups.values()) {
    const members = idxs.map((i) => classified[i]);

    // Canonical = highest source quality, tie-break highest composite,
    // tie-break earliest publish date.
    const sorted = [...members].sort((a, b) => {
      if (b.source_quality !== a.source_quality) return b.source_quality - a.source_quality;
      if (b.composite_score !== a.composite_score) return b.composite_score - a.composite_score;
      const da = new Date(a.signal.published_date || 0).getTime();
      const db = new Date(b.signal.published_date || 0).getTime();
      return da - db;
    });
    const canonical = sorted[0];

    // Corroboration only counts distinct, credible (quality >= 0.8)
    // domains — a foreign-mirror or low-credibility duplicate still shows
    // up under "supporting" for transparency, but doesn't boost the score.
    const qualifyingDomains = new Set(
      members
        .filter((m) => m.source_quality >= MIN_QUALITY_FOR_CORROBORATION)
        .map((m) => domainOf(m.signal.url))
    );
    const corroboration_count = qualifyingDomains.size;
    const multiplier = multiplierFor(corroboration_count);
    const final_composite = Math.round(canonical.composite_score * multiplier * 10) / 10;

    items.push({
      cluster_size: members.length,
      corroboration_count,
      corroboration_multiplier: multiplier,
      final_composite,
      above_threshold: final_composite >= THRESHOLD,
      canonical,
      supporting: members
        .filter((m) => m !== canonical)
        .map((m) => ({
          url: m.signal.url,
          domain: domainOf(m.signal.url),
          source_quality: m.source_quality,
        })),
    });
  }

  items.sort((a, b) => b.final_composite - a.final_composite);

  return {
    above: items.filter((i) => i.above_threshold),
    below: items.filter((i) => !i.above_threshold),
  };
}
