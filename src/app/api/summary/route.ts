// Returns a one-call summary across the whole watchlist: every core company's
// above-threshold action items. Powers the "actions across all companies"
// overview at the top of the page.
//
// Reads are wrapped in unstable_cache so a traffic spike can't hammer Vercel
// Blob: the underlying reads run at most once a day, regardless of how many
// people visit. Briefings only change weekly, so up-to-a-day staleness is fine.
// (To surface a fresh run immediately, redeploy — that resets the cache.)

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { CORE_COMPANIES, slugify } from "../../../companies";
import { getLatestBriefing } from "../../../lib/briefing-store";

export const dynamic = "force-dynamic";

interface StoredBriefing {
  company: string;
  generated_at: string;
  briefing: { above: unknown[]; below: unknown[] };
}

const cachedSummary = unstable_cache(
  async () => {
    const companies = await Promise.all(
      CORE_COMPANIES.map(async (company) => {
        const slug = slugify(company);
        const data = (await getLatestBriefing(slug)) as StoredBriefing | null;
        return {
          company,
          slug,
          generated_at: data?.generated_at ?? null,
          above: data?.briefing?.above ?? [],
          hasData: !!data,
        };
      })
    );

    const generated_at =
      companies
        .map((c) => c.generated_at)
        .filter((d): d is string => !!d)
        .sort()
        .reverse()[0] ?? null;

    return { generated_at, companies };
  },
  ["summary-all"],
  { revalidate: 86400 }
);

export async function GET() {
  return NextResponse.json(await cachedSummary());
}
