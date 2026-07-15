// Stage 2 entry point: load the latest raw signals for a company,
// classify each one with Claude, print the briefing-shaped output,
// and save the classified JSON for Stage 3.
//
// Run: npm run classify -- Anthropic

import { config } from "dotenv";
config({ path: ".env.local" });

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import { classifySignal, type ClassifiedSignal } from "./classifier.js";
import type { TavilyResult } from "./fetchers/tavily.js";
import { CATEGORY_NAMES } from "./categories.js";

function findLatestRawFile(slug: string): string {
  const rawDir = "data/raw";
  const files = readdirSync(rawDir).filter(
    (f) => f.startsWith(slug + "-") && f.endsWith(".json")
  );
  if (files.length === 0) {
    throw new Error(
      `No raw signals found for "${slug}" in ${rawDir}/. Run \`npm run fetch -- <Company>\` first.`
    );
  }
  files.sort().reverse();
  return join(rawDir, files[0]);
}

function printSignal(c: ClassifiedSignal, n: number): void {
  const cat = CATEGORY_NAMES[c.primary_category] || `Cat ${c.primary_category}`;
  const secondary =
    c.secondary_categories.length > 0
      ? ` + ${c.secondary_categories
          .map((s) => CATEGORY_NAMES[s] || `Cat ${s}`)
          .join(", ")}`
      : "";
  const mode = c.action_mode.toUpperCase().padEnd(10);
  const urgency = c.time_sensitivity.toUpperCase();

  console.log(`${n.toString().padStart(2)}. [${cat}${secondary}]`);
  console.log(`    ${c.one_line_summary}`);
  console.log(
    `    composite ${c.composite_score.toFixed(1)}  |  R${c.relevance} × A${c.actionability} × SQ${c.source_quality.toFixed(1)}  |  ${mode}  |  ${urgency}`
  );
  if (c.recommended_action) {
    console.log(`    → ${c.recommended_action}`);
  }
  console.log(`    ${c.signal.url}\n`);
}

async function main() {
  const company = process.argv[2] || "Anthropic";
  const slug = company.toLowerCase().replace(/\s+/g, "-");

  const inPath = findLatestRawFile(slug);
  console.log(`\n📥 Loading raw signals from ${inPath}\n`);

  const raw = JSON.parse(readFileSync(inPath, "utf-8")) as {
    company: string;
    fetched_at: string;
    signal_count: number;
    signals: TavilyResult[];
  };

  console.log(`🧠 Classifying ${raw.signals.length} signals with Claude...\n`);

  // Batch to avoid rate-limiting and stay readable.
  const BATCH = 5;
  const classified: ClassifiedSignal[] = [];

  for (let i = 0; i < raw.signals.length; i += BATCH) {
    const slice = raw.signals.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const totalBatches = Math.ceil(raw.signals.length / BATCH);
    process.stdout.write(`   Batch ${batchNum}/${totalBatches}... `);

    const results = await Promise.all(
      slice.map((s) =>
        classifySignal(s, company).catch((err) => {
          console.error(`\n   ⚠️  Failed to classify "${s.title}": ${err.message}`);
          return null;
        })
      )
    );

    const ok = results.filter((r): r is ClassifiedSignal => r !== null);
    classified.push(...ok);
    process.stdout.write(`done (${ok.length}/${slice.length})\n`);
  }

  classified.sort((a, b) => b.composite_score - a.composite_score);
  const above = classified.filter((c) => c.above_threshold);
  const below = classified.filter((c) => !c.above_threshold);

  console.log(`\n${"=".repeat(74)}`);
  console.log(
    `🎯 ACTION THIS WEEK — ${above.length} signal${above.length === 1 ? "" : "s"} above threshold (composite ≥ 12)`
  );
  console.log("=".repeat(74) + "\n");

  if (above.length === 0) {
    console.log("   (No material signals above threshold this run.)\n");
  } else {
    above.forEach((c, i) => printSignal(c, i + 1));
  }

  console.log("-".repeat(74));
  console.log(
    `💤 SAW & FILTERED — ${below.length} signal${below.length === 1 ? "" : "s"} below threshold`
  );
  console.log("-".repeat(74) + "\n");

  below.forEach((c, i) => {
    const cat =
      CATEGORY_NAMES[c.primary_category] || `Cat ${c.primary_category}`;
    const reason = c.below_threshold_reason || "below threshold";
    console.log(
      `   ${(i + 1).toString().padStart(2)}. [${cat}] ${c.signal.title}`
    );
    console.log(
      `       composite ${c.composite_score.toFixed(1)} | ${reason}`
    );
  });

  // Save for Stage 3
  const outDir = "data/classified";
  mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outPath = join(outDir, `${slug}-${timestamp}.json`);
  writeFileSync(
    outPath,
    JSON.stringify(
      {
        company,
        classified_at: new Date().toISOString(),
        raw_source: inPath,
        above_count: above.length,
        below_count: below.length,
        classified,
      },
      null,
      2
    )
  );

  console.log(`\n💾 Saved classified signals → ${outPath}\n`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
