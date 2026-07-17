"use client";

import { useEffect, useRef, useState } from "react";
import { CORE_COMPANIES } from "../companies";
import { CATEGORY_NAMES } from "../categories";

interface CanonicalSignal {
  signal: { title: string; url: string; published_date?: string };
  primary_category: number;
  one_line_summary: string;
  recommended_action: string;
  action_mode: "reach_out" | "reposition" | "reorient" | "none";
  time_sensitivity: "high" | "medium" | "low";
  below_threshold_reason: string;
  composite_score: number;
}

interface BriefingItem {
  cluster_size: number;
  corroboration_count: number;
  corroboration_multiplier: number;
  final_composite: number;
  canonical: CanonicalSignal;
  supporting: { url: string; domain: string; source_quality: number }[];
}

interface BriefingResponse {
  company: string;
  generated_at: string;
  above_count: number;
  below_count: number;
  briefing: { above: BriefingItem[]; below: BriefingItem[] };
}

interface ApiError {
  error: string;
  hint?: string;
}

interface SummaryCompany {
  company: string;
  slug: string;
  generated_at: string | null;
  above: BriefingItem[];
  hasData: boolean;
}

interface SummaryResponse {
  generated_at: string | null;
  companies: SummaryCompany[];
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function catName(n: number): string {
  return CATEGORY_NAMES[n] || `Category ${n}`;
}

function ActionCard({ item }: { item: BriefingItem }) {
  const c = item.canonical;
  return (
    <div className="card">
      <div className="card-top">
        <span className="category">{catName(c.primary_category)}</span>
        <span className="badge">{c.action_mode.replace("_", " ")}</span>
      </div>
      <div className="summary">{c.one_line_summary}</div>
      {c.recommended_action && <div className="action">→ {c.recommended_action}</div>}
      <div className="factrow">
        <span>score {item.final_composite.toFixed(1)}</span>
        <span>urgency: {c.time_sensitivity}</span>
        {item.corroboration_count > 1 && (
          <span>
            corroborated by {item.corroboration_count} sources (×{item.corroboration_multiplier})
          </span>
        )}
      </div>
      <div className="sources">
        <a href={c.signal.url} target="_blank" rel="noreferrer">
          {domainOf(c.signal.url)}
        </a>
        {item.supporting.length > 0 &&
          item.supporting.map((s) => (
            <span key={s.url}>
              {" "}
              ·{" "}
              <a href={s.url} target="_blank" rel="noreferrer">
                {s.domain}
              </a>
            </span>
          ))}
      </div>
    </div>
  );
}

function FilteredRow({ item }: { item: BriefingItem }) {
  const c = item.canonical;
  return (
    <div className="filtered-row">
      <span className="cat">[{catName(c.primary_category)}]</span>
      {c.signal.title}
      {item.cluster_size > 1 && ` (collapses ${item.cluster_size} raw signals)`}
      {c.below_threshold_reason && <span className="filtered-reason">{c.below_threshold_reason}</span>}
    </div>
  );
}

// Compact one-line action used in the top overview, so the whole watchlist
// scans quickly. Clicking the company header (below) jumps to the full card.
function OverviewItem({ item }: { item: BriefingItem }) {
  const c = item.canonical;
  return (
    <div className="ov-item">
      <div className="ov-summary">{c.one_line_summary}</div>
      <div className="ov-facts">
        <span className="badge">{c.action_mode.replace("_", " ")}</span>
        <span>{catName(c.primary_category)}</span>
        <span>urgency: {c.time_sensitivity}</span>
        <span>score {item.final_composite.toFixed(1)}</span>
        <a href={c.signal.url} target="_blank" rel="noreferrer">
          {domainOf(c.signal.url)}
        </a>
      </div>
    </div>
  );
}

function Glossary() {
  return (
    <details className="glossary">
      <summary>How this is scored &amp; what the terms mean</summary>

      <dl>
        <dt>Score</dt>
        <dd>
          Every signal gets a composite score of{" "}
          <em>relevance × actionability × source quality</em>. A signal needs a
          composite of <strong>12</strong> to reach “Action this week”; anything
          below drops to “Saw &amp; filtered.”
          <ul>
            <li>
              <strong>Relevance (1–5):</strong> how directly it affects
              partnership strategy — a named alliance or a Head of Partnerships
              hire scores high; general PR scores low.
            </li>
            <li>
              <strong>Actionability (1–5):</strong> whether a partnerships leader
              could act on it in the next ~30 days.
            </li>
            <li>
              <strong>Source quality (0.5–1.5):</strong> a multiplier for how
              credible the outlet is — 1.5 for Bloomberg/Reuters/primary filings,
              1.0 for a company press release, 0.5 for a single low-credibility
              blog.
            </li>
          </ul>
        </dd>

        <dt>Urgency</dt>
        <dd>
          <strong>High</strong> — a natural action window inside ~30 days.{" "}
          <strong>Medium</strong> — a 30–60 day window.{" "}
          <strong>Low</strong> — no calendar pressure; a longer-horizon signal.
        </dd>

        <dt>Action</dt>
        <dd>
          <strong>Reach out</strong> — the signal opens a new door: a person to
          contact, or a relationship to start or re-engage.{" "}
          <strong>Reorient</strong> — it shifts portfolio priorities: move
          accounts up or down, or start/stop a program.{" "}
          <strong>None</strong> — context only, with no concrete 30–60 day move.
          (A fourth option, “reposition,” is intentionally left out — that
          depends on private, in-flight deal context the agent can’t see.)
        </dd>

        <dt>Sources &amp; how they collapse</dt>
        <dd>
          When several outlets cover the same event (same category, within ~6
          days, sharing a meaningful headline keyword), they’re grouped into a
          single item. The most credible outlet becomes the headline source; the
          rest appear as “also covered by.” A story confirmed by multiple
          credible outlets earns a <em>corroboration boost</em> (×1.15 for two
          sources, up to ×1.3 for four or more) — because independent
          confirmation makes it more real. Low-credibility duplicates still show
          up for transparency but don’t boost the score.
        </dd>
      </dl>
    </details>
  );
}

export default function Home() {
  const [company, setCompany] = useState<string>(CORE_COMPANIES[0]);
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const briefingRef = useRef<HTMLDivElement | null>(null);

  // Load the all-companies overview once.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/summary")
      .then((res) => res.json())
      .then((json) => {
        if (!cancelled) setSummary(json as SummaryResponse);
      })
      .catch(() => {
        if (!cancelled) setSummary(null);
      })
      .finally(() => {
        if (!cancelled) setSummaryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Load the selected company's full briefing.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setApiError(null);
    setData(null);

    fetch(`/api/briefing/${encodeURIComponent(company)}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) setApiError(json as ApiError);
        else setData(json as BriefingResponse);
      })
      .catch((err) => {
        if (!cancelled) setApiError({ error: err.message });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [company]);

  function jumpToCompany(name: string) {
    setCompany(name);
    // let state settle, then scroll the full briefing into view
    setTimeout(() => {
      briefingRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }

  const withActions = summary?.companies.filter((c) => c.above.length > 0) ?? [];
  const quiet =
    summary?.companies.filter((c) => c.hasData && c.above.length === 0) ?? [];
  const totalActions = withActions.reduce((n, c) => n + c.above.length, 0);

  return (
    <main className="wrap">
      <div className="eyebrow">Partner Pulse</div>
      <h1>This week&rsquo;s actions</h1>
      <div className="dek">
        Public signals across your watchlist, scored the same way a partnership
        opportunity gets scored.
      </div>

      <div className="controls">
        <span className="overview-count">
          {summaryLoading
            ? "Loading watchlist…"
            : `${totalActions} action${totalActions === 1 ? "" : "s"} across ${withActions.length} compan${
                withActions.length === 1 ? "y" : "ies"
              }`}
        </span>
        {summary?.generated_at && (
          <span className="meta">
            Last updated{" "}
            {new Date(summary.generated_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · refreshes Mondays
          </span>
        )}
      </div>

      <Glossary />

      {/* ---- Top overview: actions grouped by company ---- */}
      {!summaryLoading && (
        <section className="overview">
          {withActions.length === 0 ? (
            <p className="empty">Nothing cleared the bar across the watchlist this week.</p>
          ) : (
            withActions.map((c) => (
              <div className="company-group" key={c.slug}>
                <button className="company-head" onClick={() => jumpToCompany(c.company)}>
                  <span className="company-name">{c.company}</span>
                  <span className="company-count">
                    {c.above.length} action{c.above.length === 1 ? "" : "s"} ↓
                  </span>
                </button>
                {c.above.map((item) => (
                  <OverviewItem key={item.canonical.signal.url} item={item} />
                ))}
              </div>
            ))
          )}

          {quiet.length > 0 && (
            <p className="quiet">
              Quiet this week: {quiet.map((c) => c.company).join(", ")}
            </p>
          )}
        </section>
      )}

      {/* ---- Full per-company briefing ---- */}
      <div className="controls full-briefing-controls" ref={briefingRef}>
        <label htmlFor="company-select">Full briefing</label>
        <select
          id="company-select"
          value={company}
          onChange={(e) => setCompany(e.target.value)}
        >
          {CORE_COMPANIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {data && (
          <span className="meta">
            generated {new Date(data.generated_at).toLocaleString()}
          </span>
        )}
      </div>

      {loading && <p className="loading">Loading briefing…</p>}

      {apiError && (
        <div className="error">
          {apiError.error}
          {apiError.hint && (
            <>
              <br />
              <code>{apiError.hint}</code>
            </>
          )}
        </div>
      )}

      {data && (
        <>
          <h2>Action this week ({data.briefing.above.length})</h2>
          {data.briefing.above.length === 0 ? (
            <p className="empty">Nothing cleared the bar this run.</p>
          ) : (
            data.briefing.above.map((item) => (
              <ActionCard key={item.canonical.signal.url} item={item} />
            ))
          )}

          <details>
            <summary>Saw &amp; filtered ({data.briefing.below.length})</summary>
            {data.briefing.below.map((item) => (
              <FilteredRow key={item.canonical.signal.url} item={item} />
            ))}
          </details>
        </>
      )}
    </main>
  );
}
