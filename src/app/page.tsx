"use client";

import { useEffect, useState } from "react";
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

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function ActionCard({ item }: { item: BriefingItem }) {
  const c = item.canonical;
  const cat = CATEGORY_NAMES[c.primary_category] || `Category ${c.primary_category}`;

  return (
    <div className="card">
      <div className="card-top">
        <span className="category">{cat}</span>
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
  const cat = CATEGORY_NAMES[c.primary_category] || `Category ${c.primary_category}`;
  return (
    <div className="filtered-row">
      <span className="cat">[{cat}]</span>
      {c.signal.title}
      {item.cluster_size > 1 && ` (collapses ${item.cluster_size} raw signals)`}
      {c.below_threshold_reason && <span className="filtered-reason">{c.below_threshold_reason}</span>}
    </div>
  );
}

export default function Home() {
  const [company, setCompany] = useState<string>(CORE_COMPANIES[0]);
  const [data, setData] = useState<BriefingResponse | null>(null);
  const [apiError, setApiError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setApiError(null);
    setData(null);

    fetch(`/api/briefing/${encodeURIComponent(company)}`)
      .then(async (res) => {
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setApiError(json as ApiError);
        } else {
          setData(json as BriefingResponse);
        }
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

  return (
    <main className="wrap">
      <div className="eyebrow">Partner Pulse</div>
      <h1>Briefing for {company}</h1>
      <div className="dek">Public signals, scored the same way a partnership opportunity gets scored.</div>

      <div className="controls">
        <label htmlFor="company-select">Company</label>
        <select id="company-select" value={company} onChange={(e) => setCompany(e.target.value)}>
          {CORE_COMPANIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        {data && (
          <span className="meta">
            Last updated{" "}
            {new Date(data.generated_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}{" "}
            · refreshes Mondays
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
            data.briefing.above.map((item) => <ActionCard key={item.canonical.signal.url} item={item} />)
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
