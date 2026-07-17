// Returns the latest pre-generated briefing for a company.
//
// Briefings are generated ahead of time by the weekly refresh (run-refresh.ts,
// driven by the GitHub Actions schedule) and stored via the shared briefing
// store — Vercel Blob in production, local disk in dev. This route only READS;
// it never calls Tavily/Anthropic at request time, so a public visitor can
// never trigger paid API usage. Cost is incurred only by the scheduled run.

import { NextResponse } from "next/server";
import { slugify } from "../../../../companies";
import { getLatestBriefing } from "../../../../lib/briefing-store";

// Never statically cache: the file is generated after build, and we want each
// request to reflect the most recent weekly run.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { company: string } }
) {
  const company = decodeURIComponent(params.company);
  const slug = slugify(company);

  const briefing = await getLatestBriefing(slug);

  if (!briefing) {
    return NextResponse.json(
      {
        error: `No briefing for ${company} yet. Briefings refresh every Monday.`,
      },
      { status: 404 }
    );
  }

  return NextResponse.json(briefing);
}
