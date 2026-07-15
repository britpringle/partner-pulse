// Stage 1: pull raw signals from Tavily for one company.
// Run: npm run fetch -- Anthropic
//
// Outputs:
//   - console: pretty-printed summary
//   - file: data/raw/{company}-{timestamp}.json

import { config } from "dotenv";
config({ path: ".env.local" });
import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { fetchSignalsForCompany } from "./fetchers/tavily.js";
import { isKnownCompany } from "./companies.js";

async function main() {
  const company = process.argv[2] || "Anthropic";

  if (!isKnownCompany(company)) {
    console.warn(
      `⚠️  ${company} isn't in our core/bench list. Fetching anyway.\n`
    );
  }

  console.log(`\n🔍 Fetching signals for ${company} (last 7 days)...\n`);

  const start = Date.now();
  const signals = await fetchSignalsForCompany(company);
  const elapsed = ((Date.now() - start) / 1000).toFixed(1);

  console.log(`✅ ${signals.length} unique signals returned in ${elapsed}s\n`);

  // Pretty-print one-line summaries
  signals.forEach((s, i) => {
    const n = (i + 1).toString().padStart(2);
    const date = s.published_date || "no-date";
    const score = s.score.toFixed(3);
    const snippet = s.content.slice(0, 140).replace(/\s+/g, " ");

    console.log(`${n}. [${date}] ${s.title}`);
    console.log(`    ${s.url}`);
    console.log(`    score:${score} | ${snippet}...\n`);
  });

  // Save raw payload for next stages
  const outDir = "data/raw";
  mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const slug = company.toLowerCase().replace(/\s+/g, "-");
  const outPath = join(outDir, `${slug}-${timestamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        company,
        fetched_at: new Date().toISOString(),
        signal_count: signals.length,
        signals,
      },
      null,
      2
    )
  );
  console.log(`💾 Saved raw signals → ${outPath}\n`);
}

main().catch((err) => {
  console.error("❌ Error:", err.message);
  process.exit(1);
});
