// One cached snapshot of every company's latest briefing.
//
// Both the overview (/api/summary) and the per-company view
// (/api/briefing/[company]) read through THIS single cache, so they can never
// disagree — no more "shows in the overview but empty in the full briefing."
// Revalidated daily, which also keeps Blob operations low no matter the traffic.
//
// This module uses next/cache, so it is only imported by the route handlers
// (never by the CLI scripts).

import { unstable_cache } from "next/cache";
import { CORE_COMPANIES, slugify } from "../companies";
import { getLatestBriefing } from "./briefing-store";

export interface StoredBriefing {
  company: string;
  generated_at: string;
  above_count?: number;
  below_count?: number;
  briefing: { above: unknown[]; below: unknown[] };
}

export const getAllBriefings = unstable_cache(
  async (): Promise<Record<string, StoredBriefing | null>> => {
    const entries = await Promise.all(
      CORE_COMPANIES.map(async (company) => {
        const slug = slugify(company);
        const data = (await getLatestBriefing(slug)) as StoredBriefing | null;
        return [slug, data] as const;
      })
    );
    return Object.fromEntries(entries);
  },
  ["all-briefings"],
  { revalidate: 86400 }
);
