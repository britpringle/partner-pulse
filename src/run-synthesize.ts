// Stage 3 entry point: load the latest classified signals for a company,
// cluster duplicates covering the same event, apply the corroboration
// multiplier, and print + save the weekly briefing.
//
// Run: npm run synthesize -- Anthropic

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "fs";
import { join } from "path";
import type { ClassifiedSignal } from "./classifier.js";
import { synthesize, type Briefing, type BriefingItem } from "./synthesizer.js";
import { CATEGORY_NAMES } from "./categories.js";
import { putLatestBriefing } from "./lib/briefing-store.js";

function findLatestClassifiedFile(slug: string): string {
  const dir = "data/classified";
  const files = readdirSync(dir).filter(
    (f) => f.startsWith(slug + "-") && f.endsWith(".json")
  );
  if (files.length === 0) {
    throw new Error(
      `No classified signals found for "${slug}" in ${dir}/. Run \`npm run classify -- <Company>\` first.`
    );
  }
  files.sort().reverse();
  return join(dir, files[0]);
}

// Defensive cleanup: classifier output occasionally leaks stray tag-like
// artifacts (e.g. a trailing "</reason>") into free-text fields. Strip
// anything that looks like an XML/HTML tag before it reaches the briefing.
function clean(text: string): string {
  return text.replace(/<\/?[a-z][\w-]*>/gi, "").trim();
}

function printItem(item: BriefingItem, n: number): void {
  const c = item.canonical;
  const cat = CATEGORY_NAMES[c.primary_category] || `Cat ${c.primary_category}`;
  const mode = c.action_mode.toUpperCase().padEnd(10);
  const urgency = c.time_sensitivity.toUpperCase();
  const corrob =
    item.corroboration_count > 1
      ? ` | corroborated by ${item.corroboration_count} sources (×${item.corroboration_multiplier})`
      : "";

  console.log(`${n.toString().padStart(2)}. [${cat}] ${clean(c.one_line_summary)}`);
  console.log(
    `    final ${item.final_composite.toFixed(1)}  (base ${c.composite_score.toFixed(1)})  |  ${mode}  |  ${urgency}${corrob}`
  );
  if (c.recommended_action) {
    console.log(`    → ${clean(c.recommended_action)}`);
  }
  console.log(`    canonical: ${c.signal.url}`);
  if (item.supporting.length > 0) {
    for (const s of item.supporting) {
      console.log(`    also covered by: ${s.domain} (quality ${s.source_quality})`);
    }
  }
  console.log("");
}

function toMarkdown(company: string, briefing: Briefing): string {
  const lines: string[] = [];
  lines.push(`# Partner Pulse — Weekly Briefing`);
  lines.push("");
  lines.push(`**Target:** ${company}`);
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push(`**Above threshold:** ${briefing.above.length} | **Filtered:** ${briefing.below.length}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push(`## Action this week`);
  lines.push("");

  briefing.above.forEach((item, i) => {
    const c = item.canonical;
    const cat = CATEGORY_NAMES[c.primary_category] || `Cat ${c.primary_category}`;
    lines.push(`### ${i + 1}. ${clean(c.one_line_summary)}`);
    lines.push("");
    lines.push(`**Category:** ${cat} | **Action:** ${c.action_mode} | **Urgency:** ${c.time_sensitivity}`);
    lines.push(`**Score:** ${item.final_composite.toFixed(1)} (base ${c.composite_score.toFixed(1)}${item.corroboration_count > 1 ? `, ×${item.corroboration_multiplier} for ${item.corroboration_count} corroborating sources` : ""})`);
    lines.push("");
    if (c.recommended_action) {
      lines.push(`**Recommended action:** ${clean(c.recommended_action)}`);
      lines.push("");
    }
    lines.push(`**Source:** [${new URL(c.signal.url).hostname.replace(/^www\./, "")}](${c.signal.url})`);
    if (item.supporting.length > 0) {
      lines.push(`**Also covered by:** ${item.supporting.map((s) => s.domain).join(", ")}`);
    }
    lines.push("");
    lines.push("---");
    lines.push("");
  });

  lines.push(`## Saw & filtered (${briefing.below.length})`);
  lines.push("");
  briefing.below.forEach((item) => {
    const c = item.canonical;
    const cat = CATEGORY_NAMES[c.primary_category] || `Cat ${c.primary_category}`;
    const reason = clean(c.below_threshold_reason || "below threshold");
    lines.push(`- [${cat}] ${c.signal.title} — composite ${item.final_composite.toFixed(1)} — ${reason}`);
  });
  lines.push("");

  return lines.join("\n");
}

async function main() {
  const company = process.argv[2] || "Anthropic";
  const slug = company.toLowerCase().replace(/\s+/g, "-");

  const inPath = findLatestClassifiedFile(slug);
  console.log(`\n📥 Loading classified signals from ${inPath}\n`);

  const raw = JSON.parse(readFileSync(inPath, "utf-8")) as {
    company: string;
    classified_at: string;
    classified: ClassifiedSignal[];
  };

  console.log(`🧵 Clustering ${raw.classified.length} classified signals by event...\n`);
  const briefing = synthesize(raw.classified);

  console.log(`${"=".repeat(74)}`);
  console.log(
    `🎯 ACTION THIS WEEK — ${briefing.above.length} item${briefing.above.length === 1 ? "" : "s"} above threshold`
  );
  console.log("=".repeat(74) + "\n");

  if (briefing.above.length === 0) {
    console.log("   (Nothing cleared the bar this run.)\n");
  } else {
    briefing.above.forEach((item, i) => printItem(item, i + 1));
  }

  console.log("-".repeat(74));
  console.log(`💤 SAW & FILTERED — ${briefing.below.length} clustered item${briefing.below.length === 1 ? "" : "s"}`);
  console.log("-".repeat(74) + "\n");

  briefing.below.forEach((item, i) => {
    const c = item.canonical;
    const cat = CATEGORY_NAMES[c.primary_category] || `Cat ${c.primary_category}`;
    const reason = clean(c.below_threshold_reason || "below threshold");
    const collapse = item.cluster_size > 1 ? ` (collapses ${item.cluster_size} raw signals)` : "";
    console.log(
      `   ${(i + 1).toString().padStart(2)}. [${cat}] ${c.signal.title}${collapse}`
    );
    console.log(`       final ${item.final_composite.toFixed(1)} | ${reason}`);
  });

  const outDir = "data/briefings";
  mkdirSync(outDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

  const outJson = {
    company,
    generated_at: new Date().toISOString(),
    classified_source: inPath,
    above_count: briefing.above.length,
    below_count: briefing.below.length,
    briefing,
  };

  const jsonPath = join(outDir, `${slug}-${timestamp}.json`);
  writeFileSync(jsonPath, JSON.stringify(outJson, null, 2));

  // Stable "latest" record the UI reads — routed through the shared store so
  // that when a Blob token is present (e.g. running locally to push a fix to
  // production) it updates Blob; otherwise it writes data/briefings/ on disk.
  await putLatestBriefing(slug, outJson);
  const latestLabel = process.env.BLOB_READ_WRITE_TOKEN
    ? "Vercel Blob (briefings/" + slug + "-latest.json)"
    : join(outDir, `${slug}-latest.json`);

  const mdPath = join(outDir, `${slug}-${timestamp}.md`);
  writeFileSync(mdPath, toMarkdown(company, briefing));

  console.log(`\n💾 Saved briefing → ${jsonPath}`);
  console.log(`💾 Saved briefing → ${mdPath}`);
  console.log(`💾 Updated latest → ${latestLabel}\n`);
}

main().catch((err) => {
  console.error("\n❌ Error:", err.message);
  process.exit(1);
});
