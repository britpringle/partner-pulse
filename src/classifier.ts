// Stage 2: signal classifier.
// Takes a raw signal + target company, calls Claude with the v1 classifier
// prompt, returns the structured ClassifiedSignal.
//
// Corroboration counting is deferred to Stage 3 (synthesizer) where we
// cluster signals by underlying event.

import { config } from "dotenv";
config({ path: ".env.local" });

import Anthropic from "@anthropic-ai/sdk";
import type { TavilyResult } from "./fetchers/tavily.js";
import { tierOf, TIER_LABELS } from "./companies.js";

const CLASSIFIER_MODEL = "claude-haiku-4-5-20251001";

// Inclusion threshold for composite scores. Shared with the synthesizer
// (Stage 3), which re-applies this same cutoff to the corroboration-
// boosted cluster score.
export const THRESHOLD = 12;

const SYSTEM_PROMPT = `You are a senior partnerships analyst evaluating raw signals about target companies to decide whether they warrant action from a partnerships leader. You think like an operator, not a journalist. You are skeptical of press release language, attentive to primary-data signals, and you weight evidence by source quality.

TAXONOMY (10 categories)
1. People & org moves — Director+ named individuals in BD, partnerships, channel, ecosystem, GTM leadership; board additions.
2. Partnership & alliance announcements — new strategic partnerships, marketplace launches, channel program changes, integrations announced.
3. Product, platform & ecosystem launches — new SDKs, APIs, MCP servers, connectors, dev platforms, marketplaces, partner-facing tooling, deprecations.
4. Capital events — funding rounds, M&A (theirs and being acquired), IPO filings, earnings/disclosure language, hiring velocity (aggregate volume changes in BD/partnerships/channel/SA/DevRel functions).
5. Workforce reductions — layoffs (especially function-scoped), hiring freezes, office closures, program/org sunsets.
6. Standards, protocols & open-source activity — named-protocol moves (MCP, AP2, A2A, UCP) and governance/standards-body activity score highest. Routine OSS contributions score lower.
7. Customer & market signals — major customer wins, lost flagship customers, new vertical entry, geographic expansion, pricing/take-rate changes.
8. Regulatory, policy & safety events — lawsuits, antitrust, regulatory inquiries, safety/privacy/compliance moves, policy stances, geopolitical exposure.
9. Executive voice & strategic positioning — major conference talks, podcast appearances, strategy blog posts, LinkedIn posts revealing direction, brand/positioning shifts.
10. Developer ecosystem health & velocity — primary-data signals: GitHub stars/commits/releases, MCP server count, npm/PyPI download trends, public API surface changes, Discord/forum activity, dev event signups.

BOUNDARY RULE
Individual named hires/departures at Director+ = Category 1.
Aggregate volume changes in a function = Category 4 (hiring velocity).

SCORING

relevance (1-5): How directly does this affect partnerships strategy?
  5 = Direct partnership signal (named strategic alliance, Head of Partnerships hire, named-protocol move)
  4 = Strong indirect signal (relevant exec hire, capital event changing deal pace)
  3 = Moderate signal (product launch with partnership implication)
  2 = Weak signal (general positioning, customer win in non-adjacent vertical)
  1 = Noise (general PR, awards, content marketing)

actionability (1-5): Can a partnerships leader act on this in the next 30 days?
  5 = Immediate concrete action (warm intro, re-engagement, deal reshape)
  3 = Action within 30-60 days
  1 = Watch only

source_quality (0.5-1.5 multiplier):
  1.5 = The Information, Bloomberg, Reuters, WSJ, NYT, FT, primary data (GitHub, SEC filings, official transcripts)
  1.2 = TechCrunch, Axios, Stratechery, Pitchbook, named industry analysts
  1.0 = Company press release, official blog post, mainstream business press
  0.8 = Trade press, niche outlets
  0.5 = Single Substack, anonymous tweet, low-credibility blog, foreign-language mirror sites with no original reporting

action_mode (one of three — "reposition" is intentionally NOT a valid option because the agent does not have access to in-flight deal context):
  reach_out — signal opens a new door: a named person to contact, a relationship to start or re-engage, a warm intro path to activate. Examples: new BD/partnerships hire at target, BD layoff (former employees become warm intro paths), new SDK/API launch (reach out to ISVs in network who'd benefit), strategic alliance announcement (target's BD lead is now under pressure — door is open).
  reorient — signal changes account priorities at the portfolio level: move accounts up/down the priority list, kill or start programs, reallocate resources. Examples: major funding round (priority up), M&A or org shutdown (priority shift), vertical entry (reprioritize partners in that vertical), regulatory event (risk-reweight portfolio).
  none — context only, no concrete action in the next 30-60 days. Should be rare for above-threshold signals — if you can't name a reach_out or reorient action, the signal is probably below threshold.

Important: if a signal would naturally be "reposition" (i.e., it changes the terms of a conversation you're already in) and does NOT also open a new door or shift portfolio priorities, default to "none" — the agent cannot assess reposition signals reliably without private CRM context.

TIER-AWARE REORIENT
Each target company has a current partnership tier: 1 = Transactional, 2 = Strategic, 3 = Transformational (the highest). The company's current tier is given in the input. When action_mode is "reorient", respect that tier and make the DIRECTION explicit in recommended_action:
- Tier 3 (Transformational) is the ceiling — it cannot be promoted higher. A reorient here means DEFEND or DEEPEN the existing investment on a positive signal, or flag DOWNGRADE / concentration risk on a negative one. Never imply moving a Tier 3 company "up."
- Tier 1 or 2: a strong positive signal may justify PROMOTING toward a higher tier (name the target tier); a negative signal may justify a DOWNGRADE. Say which.
Always name the direction — defend, deepen, promote toward Tier N, or watch for downgrade — in recommended_action.

time_sensitivity:
  high — relevant calendar event within 30 days OR signal has a natural 30-day action window (e.g., new BD hire's first 90 days)
  medium — 30-60 day action window
  low — no calendar pressure, longer-horizon signal

THRESHOLD
Composite = relevance × actionability × source_quality. The system uses 12 as the inclusion threshold downstream. Be honest — do not inflate.

STYLE GUARDRAILS
- recommended_action MUST sound like a partnerships operator wrote it. No "consider exploring synergies." No "leverage this opportunity." Use verbs like surface, map, engage, warm intro, re-prioritize, deprioritize, sequence behind.
- If the signal could be a press release dressed as partnership news (no commercial terms, no named scope, no real news), lower relevance and flag in below_threshold_reason.
- If the source is a single low-credibility outlet with no original reporting (foreign-language mirror, content-marketing roundup), set source_quality = 0.5.
- Never invent details the input doesn't support.
- below_threshold_reason: required if composite < 12; otherwise empty string.
- recommended_action: empty string if action_mode is "none".`;

const CLASSIFY_TOOL = {
  name: "classify_signal",
  description:
    "Classify a partnership signal against the v2 taxonomy with structured tags and scores.",
  input_schema: {
    type: "object" as const,
    properties: {
      primary_category: { type: "integer", description: "1-10" },
      secondary_categories: {
        type: "array",
        items: { type: "integer" },
        description: "Other categories that also apply",
      },
      relevance: { type: "integer", description: "1-5" },
      actionability: { type: "integer", description: "1-5" },
      source_quality: { type: "number", description: "0.5-1.5 multiplier" },
      action_mode: {
        type: "string",
        enum: ["reach_out", "reposition", "reorient", "none"],
      },
      time_sensitivity: {
        type: "string",
        enum: ["high", "medium", "low"],
      },
      one_line_summary: {
        type: "string",
        description: "10-20 words, partnerships operator voice",
      },
      recommended_action: {
        type: "string",
        description:
          "1-2 sentences, partnerships-flavored. Empty string if action_mode is 'none'.",
      },
      below_threshold_reason: {
        type: "string",
        description:
          "One short sentence if composite < 12, else empty string.",
      },
    },
    required: [
      "primary_category",
      "secondary_categories",
      "relevance",
      "actionability",
      "source_quality",
      "action_mode",
      "time_sensitivity",
      "one_line_summary",
      "recommended_action",
      "below_threshold_reason",
    ],
  },
};

export interface ClassifiedSignal {
  signal: TavilyResult;
  company: string;
  primary_category: number;
  secondary_categories: number[];
  relevance: number;
  actionability: number;
  source_quality: number;
  composite_score: number;
  above_threshold: boolean;
  action_mode: "reach_out" | "reposition" | "reorient" | "none";
  time_sensitivity: "high" | "medium" | "low";
  one_line_summary: string;
  recommended_action: string;
  below_threshold_reason: string;
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function classifySignal(
  signal: TavilyResult,
  company: string
): Promise<ClassifiedSignal> {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY not set in .env.local");
  }

  const domain = extractDomain(signal.url);
  const tier = tierOf(company);
  const tierLabel = TIER_LABELS[tier];
  const userMessage = `COMPANY: ${company}
CURRENT PARTNERSHIP TIER: ${tier} (${tierLabel}${tier === 3 ? ", the ceiling — cannot be promoted higher" : ""})

SIGNAL:
Title: ${signal.title}
Source: ${domain}
Date: ${signal.published_date || "unknown"}
URL: ${signal.url}

Content snippet:
${signal.content.slice(0, 800)}

Classify this signal. Be skeptical and honest — most signals are noise.`;

  const response = await client.messages.create({
    model: CLASSIFIER_MODEL,
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
    tools: [CLASSIFY_TOOL],
    tool_choice: { type: "tool", name: "classify_signal" },
  });

  const toolUse = response.content.find((c) => c.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error(
      `Classifier returned no tool_use block. Got: ${JSON.stringify(response.content)}`
    );
  }

  const r = toolUse.input as {
    primary_category: number;
    secondary_categories: number[];
    relevance: number;
    actionability: number;
    source_quality: number;
    action_mode: ClassifiedSignal["action_mode"];
    time_sensitivity: ClassifiedSignal["time_sensitivity"];
    one_line_summary: string;
    recommended_action: string;
    below_threshold_reason: string;
  };

  const composite = r.relevance * r.actionability * r.source_quality;

  return {
    signal,
    company,
    primary_category: r.primary_category,
    secondary_categories: r.secondary_categories ?? [],
    relevance: r.relevance,
    actionability: r.actionability,
    source_quality: r.source_quality,
    composite_score: composite,
    above_threshold: composite >= THRESHOLD,
    action_mode: r.action_mode,
    time_sensitivity: r.time_sensitivity,
    one_line_summary: r.one_line_summary,
    recommended_action: r.recommended_action,
    below_threshold_reason: r.below_threshold_reason,
  };
}
