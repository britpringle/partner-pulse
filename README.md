# Partner Pulse

AI agent that monitors target companies for partnership-relevant signals and turns them into an actionable weekly briefing.

Pipeline: **fetch → classify → synthesize → view**. Each stage is a standalone script that reads the previous stage's output and writes its own, so you can inspect (or hand-edit) the data at every hop.

1. **Fetch** (`npm run fetch`) — pull recent news signals from Tavily for one target company.
2. **Classify** (`npm run classify`) — score each signal with Claude against a 10-category taxonomy: relevance, actionability, source quality, and a recommended action (`reach_out`, `reorient`, or `none`).
3. **Synthesize** (`npm run synthesize`) — cluster signals that cover the same underlying event (e.g. four outlets reporting one funding round), pick a canonical source per event, and apply a corroboration boost so well-corroborated stories outrank single-source ones.
4. **View** (`npm run dev`) — a small Next.js UI that renders the latest briefing per company: "Action this week" and "Saw & filtered," collapsible.

## Setup (one-time)

1. **Install dependencies**

   ```bash
   cd partner-pulse
   npm install
   ```

2. **Set API keys**

   Copy the example env file and fill in your keys:

   ```bash
   cp .env.local.example .env.local
   ```

   Then open `.env.local` and paste in:
   - `ANTHROPIC_API_KEY` from console.anthropic.com — used by the classifier
   - `TAVILY_API_KEY` from app.tavily.com (Settings → API Keys) — used by the fetcher
   - `EXA_API_KEY` from dashboard.exa.ai (API Keys) — reserved for a second fetch source, not wired in yet

## Run the pipeline

Each stage takes a company name as an optional argument (default: Anthropic) and must match a name in `src/companies.ts`:

```bash
npm run fetch -- Stripe
npm run classify -- Stripe
npm run synthesize -- Stripe
```

Output at each stage:

| Stage | Reads | Writes |
|---|---|---|
| fetch | Tavily API | `data/raw/{company}-{timestamp}.json` |
| classify | latest `data/raw/*` | `data/classified/{company}-{timestamp}.json` |
| synthesize | latest `data/classified/*` | `data/briefings/{company}-{timestamp}.json`, `{company}-{timestamp}.md`, and `{company}-latest.json` |

The UI only ever reads `{company}-latest.json`, so re-run `synthesize` any time you want the browsable briefing to reflect fresh data.

## Run the UI

```bash
npm run dev
```

Open `http://localhost:3000`, pick a company from the dropdown. If you haven't run the pipeline for that company yet, the page tells you exactly which commands to run.

The UI reads pre-generated briefings — it does not call Tavily or Claude at request time. That keeps API keys out of any request-time code path, which matters once this is deployed somewhere public (see below).

## Automated weekly refresh (deployed)

For a public, always-current deployment, the whole watchlist refreshes on a
schedule instead of being run by hand:

```bash
npm run refresh              # fetch → classify → synthesize for ALL core companies
npm run refresh -- Stripe    # or just one, for a quick test
```

`run-refresh.ts` reuses the exact same tested logic as the per-stage scripts,
chained in memory. It writes each briefing through a small storage layer
(`src/lib/briefing-store.ts`) that uses **Vercel Blob** when `BLOB_READ_WRITE_TOKEN`
is set and **local disk** (`data/briefings/`) otherwise — so nothing changes for
local dev. A weekly GitHub Actions workflow (`.github/workflows/weekly-briefing.yml`)
runs `npm run refresh` every Monday and the deployed Next.js app reads from Blob.

**Full deploy steps are in [`DEPLOY.md`](./DEPLOY.md).** The public site stays
read-only, so publishing the link never exposes paid API usage.

## How event clustering works (Stage 3)

Outlets rarely word the same story the same way — see `data/evals/anthropic-v1-eval-claude-pass.md` for a real example where the same funding round got reported three different ways by three different outlets. The synthesizer clusters signals as "the same event" when, pairwise:

- they share a category (primary or secondary),
- they were published within 6 days of each other, and
- they share at least one non-generic title keyword — one shared keyword is enough if both signals have the *same primary* category; two are required if the overlap is only through a secondary category (a much looser signal, worth doubling the bar on).

A hand-tuned stopword list filters out generic words that would otherwise cause false merges ("deal," "AI," "billion," "OpenAI" — all common enough in this beat to show up in unrelated stories). Corroboration only counts toward the score boost from distinct, credible (quality ≥ 0.8) sources; a low-credibility duplicate (e.g. a foreign-language mirror site) still shows up under "supporting" for transparency but doesn't move the number.

This is a heuristic, not a model call — cheap and fast, but not perfect. If you find a bad merge or a missed one, the tuning knobs are all in `src/synthesizer.ts` (`CLUSTER_WINDOW_DAYS`, the stopword list, `MIN_SHARED_KEYWORDS_*`).

## Roadmap

- [x] Stage 1: raw signal fetch
- [x] Stage 2: classifier
- [x] Stage 3: synthesizer (event clustering + corroboration)
- [x] Next.js UI: browsable "briefing for [company]" view
- [x] Vercel deploy + weekly auto-refresh: GitHub Actions runs the pipeline every Monday and writes to Vercel Blob; the API route reads from Blob (falls back to disk locally). See [`DEPLOY.md`](./DEPLOY.md).
