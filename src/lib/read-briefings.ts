// Reads every company's latest briefing live.
//
// Both the overview (/api/summary) and the per-company view
// (/api/briefing/[company]) go through this one function, so they always
// reflect the same current data and can never disagree ("shows in the overview
// but empty in the full briefing"). Reads are cheap direct CDN GETs (see
// briefing-store), so there's no cache to go stale and nothing to bust — a
// fresh weekly run shows up on the site immediately.

import { CORE_COMPANIES, slugify } from "../companies";
import { getLatestBriefing } from "./briefing-store";

export interface StoredBriefing {
  company: string;
  generated_at: string;
  above_count?: number;
  below_count?: number;
  briefing: { above: unknown[]; below: unknown[] };
}

export async function getAllBriefings(): Promise<
  Record<string, StoredBriefing | null>
> {
  const entries = await Promise.all(
    CORE_COMPANIES.map(async (company) => {
      const slug = slugify(company);
      const data = (await getLatestBriefing(slug)) as StoredBriefing | null;
      return [slug, data] as const;
    })
  );
  return Object.fromEntries(entries);
}
