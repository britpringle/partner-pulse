// Returns the latest pre-generated briefing for a company.
//
// Reads only — never calls Tavily/Anthropic at request time, so a public
// visitor can never trigger paid API usage. The Blob read is wrapped in
// unstable_cache (revalidated daily) so heavy traffic can't drain the Blob
// operations quota; briefings change weekly, so daily freshness is plenty.

import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { slugify } from "../../../../companies";
import { getLatestBriefing } from "../../../../lib/briefing-store";

export const dynamic = "force-dynamic";

const cachedBriefing = unstable_cache(
  async (slug: string) => getLatestBriefing(slug),
  ["briefing-latest"],
  { revalidate: 86400 }
);

export async function GET(
  _req: Request,
  { params }: { params: { company: string } }
) {
  const company = decodeURIComponent(params.company);
  const slug = slugify(company);

  const briefing = await cachedBriefing(slug);

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
