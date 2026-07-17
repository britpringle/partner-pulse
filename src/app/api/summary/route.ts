// The "actions across all companies" overview. Reads live through the shared
// getAllBriefings reader, so it is always consistent with the per-company view
// and never triggers paid API calls at request time.

import { NextResponse } from "next/server";
import { CORE_COMPANIES, slugify } from "../../../companies";
import { getAllBriefings } from "../../../lib/read-briefings";

export const dynamic = "force-dynamic";

export async function GET() {
  const all = await getAllBriefings();

  const companies = CORE_COMPANIES.map((company) => {
    const slug = slugify(company);
    const data = all[slug];
    return {
      company,
      slug,
      generated_at: data?.generated_at ?? null,
      above: data?.briefing?.above ?? [],
      hasData: !!data,
    };
  });

  const generated_at =
    companies
      .map((c) => c.generated_at)
      .filter((d): d is string => !!d)
      .sort()
      .reverse()[0] ?? null;

  return NextResponse.json({ generated_at, companies });
}
