# How Partner Pulse Works — A Guided Tour

This is a plain-English explanation of everything your system does and how the
pieces fit together. It assumes no engineering background. Read it top to
bottom once, and you'll be able to explain the whole thing to anyone — including
in a job interview.

---

## 1. The 30-second picture

Partner Pulse watches 13 companies for partnership-relevant news, has an AI score
each piece of news for how much it matters, groups duplicate stories together,
and publishes a ranked weekly briefing to a website.

The whole thing happens on autopilot once a week. Nobody presses a button. The
flow, in one line:

> **Find the news → score it → group and rank it → save it → show it on a website.**

Everything below is just that sentence, explained.

---

## 2. The cast of characters (who does what)

Your system is a team of seven services. Here's each one and the human-job it's
doing:

**Tavily** — *the researcher.* A news-search service. You hand it a company name,
it hands back recent articles. It's the "eyes" that go find what's happening.

**Claude (Anthropic)** — *the analyst.* Anthropic's AI. It reads each article and
scores it: how relevant is this to partnerships, can someone act on it, how
trustworthy is the source, and what should you actually do about it. Specifically
it uses **Claude Haiku**, the small/fast/cheap model — perfect for scoring lots of
short items.

**Your TypeScript code** — *the operator.* This is the part *you* built. It
orchestrates everyone else: calls Tavily, sends each result to Claude, then does
the non-AI logic — grouping duplicate stories, applying the scoring math, and
deciding what clears the bar. (Notably, the grouping/ranking step uses **no AI at
all** — it's pure rules you can read and tune.)

**GitHub** — *the filing cabinet for your code.* Stores every file in your
project. This is your `britpringle/partner-pulse` repository.

**GitHub Actions** — *the alarm clock + the worker.* This is the piece that makes
it "automatic." It wakes up every Monday morning, grabs your code, and runs the
whole pipeline. It's a real computer in GitHub's cloud that does the weekly work.

**Vercel** — *the storefront.* Hosts your website (`partner-pulse-kappa.vercel.app`)
and serves it to anyone who visits.

**Vercel Blob** — *the storage locker.* A place to save files in the cloud. The
finished briefings get filed here so the website can read them. Think of it as a
shared folder that both the weekly worker and the website can reach.

The key mental model: **three of these are services you rent (Tavily, Claude,
Vercel), one is where your code lives (GitHub), one is the scheduler (GitHub
Actions), one is storage (Vercel Blob), and the glue that makes them work
together is your code.**

---

## 3. The two journeys

There are only two things that ever happen in this system. Understand both and
you understand everything.

### Journey A — The weekly build (writing the briefings)

This runs once a week, unattended. It's the expensive part (it calls the paid
APIs), and *only this* costs money.

```
   Monday, 13:00 UTC
        │
        ▼
 ┌─────────────────┐   "wake up, grab the code, run it"
 │ GitHub Actions  │
 └────────┬────────┘
          │ runs  npm run refresh
          ▼
 ┌─────────────────────────────────────────────┐
 │  YOUR CODE loops over all 13 companies:      │
 │                                              │
 │   1. Tavily  → find recent news              │
 │   2. Claude  → score each item               │
 │   3. Your logic → group + rank + threshold   │
 │   4. Save the finished briefing …            │
 └───────────────────────┬──────────────────────┘
                         ▼
                 ┌───────────────┐
                 │  Vercel Blob  │  briefings/anthropic-latest.json
                 │  (storage)    │  briefings/stripe-latest.json … ×13
                 └───────────────┘
```

At the end of this journey, there are 13 fresh JSON files sitting in Vercel Blob —
one per company. That's it. The website isn't involved yet.

### Journey B — A visitor views the site (reading the briefings)

This runs every time someone opens your site. It's **read-only** and **free** — it
never calls Tavily or Claude.

```
  Visitor opens partner-pulse-kappa.vercel.app
        │
        ▼
 ┌──────────────────┐   the page asks: "give me Anthropic's briefing"
 │  Website (Vercel)│
 └────────┬─────────┘
          │  /api/briefing/Anthropic
          ▼
 ┌──────────────────┐   reads the pre-made file
 │   Vercel Blob    │ → briefings/anthropic-latest.json
 └────────┬─────────┘
          ▼
   Briefing cards appear on the page.
   (No Tavily. No Claude. No cost. No API keys touched.)
```

This separation is the most important design idea in the whole project, so it's
worth saying plainly: **the website only ever reads files that were made earlier.
It never generates anything live.** That's why you can share the link with the
whole world and nobody can run up your bill — there's simply no path from a
visitor's click to a paid API.

---

## 4. How the code works, stage by stage

Your code lives in the `src/` folder. Here's what each important file does, in the
order the pipeline uses them.

### Stage 1 — Fetch: `src/fetchers/tavily.ts`

For each company it runs **four** targeted news searches — one broad, one for
partnerships/product launches, one for people/leadership moves, one for
funding/M&A/layoffs. Running several angled searches catches more of the *kinds*
of news you care about than a single generic search would. Then it **removes
duplicates** (the same article showing up in two searches) by web address.

Output: a list of raw news items (headline, link, snippet, date) for that company.

### Stage 2 — Classify: `src/classifier.ts`

This is where Claude does the thinking. For each news item, your code sends Claude
a detailed instruction sheet (the "system prompt") that defines a 10-category
taxonomy and a scoring rubric, then asks it to score the item on three axes:

- **relevance** (1–5): how directly this touches partnership strategy
- **actionability** (1–5): can a partnerships leader act on it in the next 30 days
- **source quality** (0.5–1.5): how trustworthy the outlet is (Bloomberg scores
  high, an anonymous blog scores low)

It multiplies them into a single **composite score**:

> composite = relevance × actionability × source_quality

Claude also writes a one-line summary and a recommended action (e.g. "reach out"
vs "reprioritize"), all in a partnerships-operator voice. To keep it fast and
cheap, your code scores items in small batches of five at a time.

One subtle, important detail: Claude is only asked to *score one item at a time*.
It is **not** asked to decide what's a duplicate or what the final ranking is —
that's the next stage, done by plain code, so it's predictable and auditable.

### Stage 3 — Synthesize: `src/synthesizer.ts` (no AI here)

Real news is messy: one funding round gets reported by Bloomberg, Reuters, and the
FT within a few days, worded three different ways. If you didn't handle that, your
briefing would show the same event three times. This stage fixes that with **pure
rules, no AI**:

- It treats two items as "the same event" only if they **share a category**, were
  published **within 6 days** of each other, **and** share a meaningful keyword in
  the headline (generic words like "AI," "deal," or "billion" are ignored so
  unrelated stories don't get glued together).
- For each group it picks one **canonical** source (highest quality), and lists the
  others as "also covered by."
- It applies a **corroboration boost**: a story confirmed by several credible
  outlets gets its score nudged up (×1.15 for 2 sources, up to ×1.3 for 4+),
  because multiple independent confirmations mean it's more real.
- Finally it applies a **threshold** (a composite of 12): anything above goes in
  "Action this week," everything else drops to a collapsible "Saw & filtered"
  list so you can see what was considered and rejected.

Because this stage is just rules, it runs instantly, costs nothing, and you can
read exactly why any two stories were or weren't merged. The tuning knobs (time
window, the ignore-word list, the keyword thresholds) all live at the top of this
file.

### Stage 4 — Save: `src/lib/briefing-store.ts`

This little file is the "where do briefings live" decision, and it's smart about
it. It checks: *is there a Vercel Blob token available?*

- **Yes** (on GitHub Actions and on the live site) → save to / read from **Vercel
  Blob**.
- **No** (on your Mac during development) → save to / read from a local
  `data/briefings/` folder on disk.

Same code, two environments, no changes needed. This is why the exact same project
works both on your laptop and in the cloud. It's a common professional pattern:
**write once, let the environment decide the details.**

### The orchestrator: `src/run-refresh.ts`

This is the single command GitHub Actions runs weekly (`npm run refresh`). It
loops over all 13 companies and, for each, calls Stage 1 → Stage 2 → Stage 3 →
Stage 4. It reuses the exact same tested logic as the individual scripts, just
chained together in one run.

### The website: `src/app/page.tsx` and `src/app/api/briefing/[company]/route.ts`

- `route.ts` is the **server** side. When the page asks for a company's briefing,
  this reads the pre-made file from Blob and hands it back. Crucially, it *only
  reads* — there's no code path here that calls Tavily or Claude.
- `page.tsx` is what you **see in the browser**: the company dropdown, the "Action
  this week" cards, the "Last updated" stamp, and the collapsible filtered list.

### The watchlist: `src/companies.ts`

Just the list of 13 core companies. Both the pipeline and the website's dropdown
read from this one list, so if you add or remove a company here, it flows through
everywhere automatically.

---

## 5. The plumbing: secrets and why keys live in two places

Your three secret keys — Anthropic, Tavily, and the Vercel Blob token — are
**never** written into your code. If they were, making the repo public would leak
them. Instead they live in two secure lockboxes, because two different actors need
them:

- **GitHub Actions secrets** — used by the *weekly build*. GitHub Actions needs
  the Anthropic and Tavily keys (to fetch and score) and the Blob token (to save).
- **Vercel environment variables** — used by the *live website*. The site only
  needs the Blob token (to read). It doesn't need the Anthropic or Tavily keys at
  all, because it never calls them — which is exactly why the site is safe to make
  public.

Same keys, stored in the place each actor can reach, and readable by neither the
public nor your code repository.

---

## 6. The decisions we made, and why

A few choices in here weren't obvious. Understanding *why* is the part that
impresses people.

**Why GitHub Actions runs the weekly job, not Vercel itself.** Vercel can run
scheduled jobs, but each one has to finish within a short time limit (a minute or
so). Your weekly run takes about **6 minutes** — 13 companies, each with several
searches and dozens of AI calls. That's too long for a Vercel job but completely
fine for a GitHub Actions runner, which has no such limit. So we split the
responsibilities: **GitHub Actions builds the data; Vercel serves it.**

**Why the Blob store must be Public.** Vercel now defaults new storage to
"private," which blocks reading files by their web address. Your website reads
briefings by address, so it needs a **public** store. (The briefings are just
public news anyway — nothing sensitive.) This is the one setting that tripped us
up during setup.

**Why the site is read-only.** The alternative — letting visitors trigger a live
run — would mean any stranger's click spends your API budget. By pre-generating
everything and having the site only *read*, publishing the link costs you nothing
no matter how many people visit.

**Why weekly, not daily.** Partnership news (funding, M&A, leadership moves) mostly
breaks on business days and doesn't change hour to hour. Weekly keeps it current
while keeping cost tiny — a few hundred searches a month, well inside the free
tiers. It also matches the original concept: a *weekly* briefing.

---

## 7. Operating it going forward

**It runs itself.** Every Monday at 13:00 UTC (~6am Pacific / 9am Eastern), GitHub
Actions refreshes all 13 briefings automatically. You don't do anything.

**To run it on demand** (your private "refresh now" button): GitHub → **Actions**
tab → **Weekly Partner Pulse refresh** → **Run workflow**. Only people with access
to your repo can do this — the public can't.

**To change the companies:** edit the list in `src/companies.ts`, commit, and push.
The next run (and the site's dropdown) pick it up automatically.

**To change the day/time:** edit the schedule line in
`.github/workflows/weekly-briefing.yml` (it uses UTC).

**What it costs:** roughly 200 Tavily searches and ~1,000 short Claude calls a
month — cents, and inside the free tiers. Cost comes *only* from the weekly run and
any manual run you trigger; visitors are free.

**If something looks stale:** check GitHub → Actions for a red run. A red run means
a global problem (an expired key, or an API quota) rather than one noisy company.
Open the failed run's logs — the error line usually names the fix. `DEPLOY.md` in
your repo has a troubleshooting section.

---

## 8. Glossary

- **Repository (repo):** the folder of your code, stored on GitHub.
- **Deploy:** publishing your code so it runs on the internet (Vercel does this).
- **API:** a way for one program to ask another for something (your code "calls the
  Tavily API" to get news).
- **API key:** a secret password that proves you're allowed to use a paid API.
- **Serverless function:** a small piece of your website's code that runs on demand
  when someone visits — like your read route. Has a short time limit.
- **Cron / scheduled workflow:** a job set to run on a clock (yours is "every
  Monday"). "Cron" is just the old Unix name for a scheduler.
- **Environment variable / secret:** a setting (often a key) stored outside your
  code, injected when the program runs.
- **Blob:** an individual file stored in the cloud (your briefings are blobs).
- **Composite score:** relevance × actionability × source quality — the single
  number that ranks each signal.
- **Threshold:** the cutoff (12) that separates "Action this week" from "filtered."
- **Corroboration:** independent confirmation of a story by multiple outlets, which
  boosts its score.

---

*If you want to go one level deeper on any single piece, open the file named in
each section — the code has plain-English comments at the top explaining what it
does and why.*
