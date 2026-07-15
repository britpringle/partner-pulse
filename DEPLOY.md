# Deploying Partner Pulse + weekly auto-refresh

**Goal:** a public URL that shows a briefing per company, refreshed automatically
every Monday morning, where **no visitor can ever trigger paid API usage.**

## How it works

```
GitHub Actions (Mon 13:00 UTC)  →  npm run refresh (all core companies)
        │                              │  Tavily fetch → Claude classify → synthesize
        │                              ▼
        │                        Vercel Blob  (briefings/<slug>-latest.json)
        ▼                              │
  (your API keys live in              ▼
   GitHub Actions secrets)      Next.js app on Vercel  →  reads Blob, renders page
                                       ▲
                                 public visitors (read-only, $0)
```

The pipeline runs on a **GitHub Actions runner**, not inside a Vercel serverless
function, on purpose: running all 13 companies (each = several Tavily searches +
dozens of Claude calls) would blow past Vercel's function timeout. A GitHub
runner has real internet, no timeout pressure, and native weekly cron.

The deployed website only ever **reads** pre-generated briefings from Vercel
Blob. It never calls Tavily or Anthropic at request time, so publishing the link
does **not** expose your API budget — cost is incurred only by the weekly run
(and any manual run you trigger yourself).

---

## One-time setup

### 0. Reinstall deps for your machine, add the new package

Per the handover, `node_modules` is platform-specific. On your Mac:

```bash
npm install                 # rebuilds native binaries for your machine
npm install @vercel/blob    # adds the one new dependency + updates package-lock.json
```

Commit the updated `package.json` and `package-lock.json`.

### 1. Push to GitHub

```bash
git add -A && git commit -m "Add weekly auto-refresh (GitHub Actions + Vercel Blob)"
git push
```

(`.env.local` stays local — it's gitignored. Don't commit real keys.)

### 2. Create the Vercel project

- Import the repo at https://vercel.com/new.
- Framework preset: **Next.js** (auto-detected). Deploy.

### 3. Add a Vercel Blob store

- In the Vercel project → **Storage** → **Create** → **Blob** → connect it to
  this project.
- Vercel automatically adds a `BLOB_READ_WRITE_TOKEN` environment variable to
  the project. **Copy its value** — you'll reuse it in GitHub in step 5.

### 4. Add the API keys to Vercel

Project → **Settings → Environment Variables**, add (Production + Preview):

| Name | Value |
|------|-------|
| `ANTHROPIC_API_KEY` | (from your `.env.local`) |
| `TAVILY_API_KEY` | (from your `.env.local`) |

`BLOB_READ_WRITE_TOKEN` is already there from step 3. Redeploy so the app picks
them up.

### 5. Add the secrets to GitHub Actions

Repo → **Settings → Secrets and variables → Actions → New repository secret**.
Add all three:

- `ANTHROPIC_API_KEY`
- `TAVILY_API_KEY`
- `BLOB_READ_WRITE_TOKEN`  ← the value you copied in step 3

These are what `.github/workflows/weekly-briefing.yml` reads.

### 6. Do the first data load (so the site isn't empty before Monday)

Two ways — either works:

- **From GitHub:** repo → **Actions** tab → **Weekly Partner Pulse refresh** →
  **Run workflow**. This is also your private "run it now" button any time.
- **From your Mac:** put the `BLOB_READ_WRITE_TOKEN` into your local `.env.local`,
  then `npm run refresh`. (Leave it blank locally if you want runs to write to
  `data/briefings/` on disk instead.)

### 7. Verify

- Open the Vercel URL. Switch companies in the dropdown — each shows its
  briefing and a **"Last updated … · refreshes Mondays"** stamp.
- Repo → Actions → confirm the run is green.
- Publish the link.

---

## The weekly schedule

Defined in `.github/workflows/weekly-briefing.yml`:

```yaml
on:
  schedule:
    - cron: "0 13 * * 1"   # 13:00 UTC every Monday
  workflow_dispatch: {}     # manual "Run workflow" button
```

GitHub cron is **UTC only**. `0 13 * * 1` ≈ 6am US Pacific / 9am US Eastern on
Mondays. To change the day/time, edit the cron string (e.g. `0 14 * * 1` for an
hour later). GitHub may start scheduled runs a few minutes late under load — fine
for a weekly briefing.

## Cost footprint (why weekly is comfortably cheap)

- **Tavily:** 13 companies × 4 searches × ~4 Mondays ≈ **~210 searches/month**
  (advanced depth may count double → ~420 credits). Free tier is ~1,000/month, so
  you're well inside it.
- **Anthropic (Haiku classifier):** ~13 companies × ~15–25 signals × 4 Mondays ≈
  ~1,000 short Haiku calls/month — cents, not dollars.

If you later go daily, multiply by ~5 and re-check the Tavily free tier before
committing.

## Changing the watchlist

Edit `CORE_COMPANIES` in `src/companies.ts`. The refresh and the UI both read
from that list, so adding/removing a company flows through automatically on the
next run.

## Security notes

- API keys live only in **Vercel env vars** and **GitHub Actions secrets** —
  never in the repo, never shipped to the browser.
- The public site is **read-only**. There is no request-time path to Tavily or
  Anthropic, so no visitor click can spend your budget.
- The only ways to trigger a paid run are the weekly schedule and the manual
  **Run workflow** button (which requires repo access).

## Troubleshooting

- **Site shows "No briefing for X yet":** the weekly run hasn't populated Blob
  yet. Do a manual run (step 6) and refresh.
- **Actions run is red:** open the run logs. Usual causes: a missing/expired
  secret, or Tavily/Anthropic quota. `npm run refresh` exits non-zero only if
  *every* company failed, so a red run means a global problem (keys/quota), not
  one noisy company.
- **Want to test one company fast:** `npm run refresh -- Stripe`.
- **Local dev with no Blob token:** leave `BLOB_READ_WRITE_TOKEN` blank; the app
  reads/writes `data/briefings/` on disk exactly as before.

## Alternative: Vercel Cron instead of GitHub Actions

Possible but not recommended here — a single serverless invocation can't process
all 13 companies within Vercel's function time limit (Hobby is especially tight),
and Hobby-plan cron granularity is limited. If you ever want it, you'd add a
protected `/api/cron/refresh` route (guarded by `CRON_SECRET`) that processes a
**subset** small enough to finish in time, and a `vercel.json` `crons` entry. The
GitHub Actions path avoids all of that.
