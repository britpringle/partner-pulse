// Returns the latest pre-generated briefing for one company.
//
// Reads live through the shared getAllBriefings reader — same data the overview
// uses, so the two can never disagree. Reads only; never calls Tavily/Anthropic
// at request time, so a public visitor can never trigger paid API usage.

import { NextResponse } from "next/server";
import { slugify } from "../../../../companies";
import { getAllBriefings } from "../../../../lib/read-briefings";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { company: string } }
) {
  const company = decodeURIComponent(params.company);
  const slug = slugify(company);

  const all = await getAllBriefings();
  const briefing = all[slug];

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
