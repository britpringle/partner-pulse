// Automation entry point: refresh briefings for the FULL core watchlist in a
// single process, writing each result through the shared briefing store
// (Vercel Blob in CI/production, local disk in dev).
//
// This is what the weekly GitHub Actions workflow runs. It deliberately reuses
// the SAME tested logic as the per-stage CLI scripts — fetchSignalsForCompany,
// classifySignal, synthesize — just chained in memory instead of via disk, so
// there are no intermediate files and it runs cleanly on an ephemeral CI
// runner. The scoring/clustering behavior (the part covered by the eval) is
// unchanged.
//
// Run: npm run refresh              # all CORE_COMPANIES (what CI runs)
//      npm run refresh -- Stripe    # one company, for a quick manual test

import { config } from "dotenv";
config({ path: ".env.local" });

import { CORE_COMPANIES, slugify } from "./companies.js";
import { fetchSignalsForCompany } from "./fetchers/tavily.js";
import { classifySignal, type ClassifiedSignal } from "./classifier.js";
import { synthesize } from "./synthesizer.js";
import { putLatestBriefing } from "./lib/briefing-store.js";

// Match run-classify's batching so we don't hammer the Anthropic API.
const CLASSIFY_BATCH = 5;

async function refreshCompany(company: string): Promise<void> {
  const slug = slugify(company);
  const started = Date.now();

  const signals = await fetchSignalsForCompany(company);

  const classified: ClassifiedSignal[] = [];
  for (let i = 0; i < signals.length; i += CLASSIFY_BATCH) {
    const slice = signals.slice(i, i + CLASSIFY_BATCH);
    const results = await Promise.all(
      slice.map((s) =>
        classifySignal(s, company).catch((err) => {
          console.error(`   ⚠️  classify failed for "${s.title}": ${err.message}`);
          return null;
        })
      )
    );
    for (const r of results) if (r) classified.push(r);
  }
  classified.sort((a, b) => b.composite_score - a.composite_score);

  const briefing = synthesize(classified);

  // Shape matches what the UI's BriefingResponse expects.
  const payload = {
    company,
    generated_at: new Date().toISOString(),
    above_count: briefing.above.length,
    below_count: briefing.below.length,
    briefing,
  };

  await putLatestBriefing(slug, payload);

  const secs = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `✅ ${company}: ${signals.length} signals → ${briefing.above.length} above / ${briefing.below.length} filtered (${secs}s)`
  );
}

async function main() {
  const arg = process.argv[2];
  const targets = arg ? [arg] : [...CORE_COMPANIES];

  const store = process.env.BLOB_READ_WRITE_TOKEN ? "Vercel Blob" : "local disk";
  console.log(
    `\n🔄 Partner Pulse refresh — ${targets.length} company(ies) → ${store}\n`
  );

  let ok = 0;
  for (const company of targets) {
    try {
      await refreshCompany(company);
      ok++;
    } catch (err) {
      console.error(`❌ ${company}: ${(err as Error).message}`);
    }
  }

  console.log(`\n📦 Done — ${ok}/${targets.length} companies refreshed.\n`);
  // Fail the CI job if literally nothing worked (bad key, quota, outage) so the
  // GitHub Actions run goes red instead of silently publishing nothing.
  if (ok === 0) process.exit(1);
}

main().catch((err) => {
  console.error("\n❌ Refresh failed:", err.message);
  process.exit(1);
});
