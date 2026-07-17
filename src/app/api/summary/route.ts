// Returns a one-call summary across the whole watchlist: every core company's
// above-threshold action items. Powers the "actions across all companies"
// overview at the top of the page, so a visitor doesn't have to flip through
// the dropdown company by company.
//
// Like the per-company route, this ONLY reads pre-generated briefings from the
// store — no Tavily/Anthropic calls, no cost at view time.

import { NextResponse } from "next/server";
import { CORE_COMPANIES, slugify } from "../../../companies";
import { getLatestBriefing } from "../../../lib/briefing-store";

export const dynamic = "force-dynamic";

interface StoredBriefing {
  company: string;
  generated_at: string;
  briefing: { above: unknown[]; below: unknown[] };
}

export async function GET() {
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

  // Most recent generation timestamp across all companies, for the header stamp.
  const generated_at =
    companies
      .map((c) => c.generated_at)
      .filter((d): d is string => !!d)
      .sort()
      .reverse()[0] ?? null;

  return NextResponse.json({ generated_at, companies });
}
