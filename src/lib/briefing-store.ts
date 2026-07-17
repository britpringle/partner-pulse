// Persistence layer for generated briefings.
//
// Two backends, chosen at runtime by whether a Vercel Blob token is present:
//   - Production / CI: Vercel Blob. Survives serverless' ephemeral filesystem
//     and is reachable by the deployed read route. Enabled when
//     BLOB_READ_WRITE_TOKEN is set (Vercel injects it automatically once a
//     Blob store is linked; GitHub Actions gets it from repo secrets).
//   - Local dev: the filesystem under data/briefings, exactly as before.
//
// Both the automated pipeline (run-refresh.ts) and the API read route go
// through this module, so the UI always reads whatever the last run wrote,
// regardless of environment. @vercel/blob is imported dynamically so the
// local-disk path never needs the package loaded.

import { mkdirSync, writeFileSync } from "fs";
import { readFile } from "fs/promises";
import { join } from "path";

const BLOB_PREFIX = "briefings";

function blobEnabled(): boolean {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

function blobPath(slug: string): string {
  return `${BLOB_PREFIX}/${slug}-latest.json`;
}

// Public base URL of the Blob store, derived from the token
// (vercel_blob_rw_<storeId>_<secret>). Lets us read a briefing with a single
// cheap CDN GET instead of a metered list() call.
function blobBaseUrl(): string | null {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  const storeId = token?.split("_")[3];
  return storeId ? `https://${storeId}.public.blob.vercel-storage.com` : null;
}

/** Write the "latest" briefing for a company. */
export async function putLatestBriefing(
  slug: string,
  data: unknown
): Promise<void> {
  const body = JSON.stringify(data, null, 2);

  if (blobEnabled()) {
    const { put } = await import("@vercel/blob");
    await put(blobPath(slug), body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false, // stable pathname so the read route can find it
      allowOverwrite: true, // replace last week's file in place
    });
    return;
  }

  const dir = "data/briefings";
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, `${slug}-latest.json`), body);
}

/** Read the "latest" briefing for a company, or null if none exists yet. */
export async function getLatestBriefing(slug: string): Promise<unknown | null> {
  if (blobEnabled()) {
    // Fast path: read the public URL directly — a cheap CDN GET, not a metered
    // list() operation, so heavy traffic won't drain the Blob quota.
    const base = blobBaseUrl();
    if (base) {
      try {
        const res = await fetch(`${base}/${blobPath(slug)}`, {
          cache: "no-store",
        });
        if (res.ok) return (await res.json()) as unknown;
      } catch {
        // fall through to the list()-based lookup below
      }
    }
    // Fallback: discover the URL via list() (e.g. if the base can't be derived).
    const { list } = await import("@vercel/blob");
    const { blobs } = await list({ prefix: blobPath(slug), limit: 1 });
    const match = blobs.find((b) => b.pathname === blobPath(slug)) ?? blobs[0];
    if (!match) return null;
    const res = await fetch(match.url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as unknown;
  }

  const filePath = join(
    process.cwd(),
    "data",
    "briefings",
    `${slug}-latest.json`
  );
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}
