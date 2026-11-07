// What version this CMS is, and whether a newer one exists.
//
// A note on what "update" can mean here, because it is not what it means in
// WordPress. WordPress ships PHP, which the server interprets on every request:
// replace the files and the site is updated, in place, immediately. This is a
// Next.js app, which is *compiled* — an update is `npm install`, then
// `next build`, then a restart. Nothing running inside the app can do that to
// itself, and on a serverless host the filesystem is read-only anyway.
//
// So the honest shape of one-click updating is: the app *asks something else*
// to rebuild it. A Vercel or Netlify deploy hook is exactly that — one POST,
// and the platform pulls the latest code and rebuilds. On a server you control,
// the same job is a shell script behind a process manager.
//
// This module owns the half that is the same either way: knowing the current
// version, fetching the published one, and deciding whether they differ.

import pkg from "../../package.json";

export const CURRENT_VERSION: string = pkg.version ?? "0.0.0";

export interface ReleaseInfo {
  version: string;
  /** ISO date, for "released 3 days ago". */
  released?: string;
  /** Human-readable lines. Rendered as a list, not as markup. */
  notes?: string[];
  /** Where to read more. */
  url?: string;
  /** Security or data-integrity fixes, so the UI can say so loudly. */
  critical?: boolean;
}

export interface UpdateStatus {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
  release: ReleaseInfo | null;
  /** How the "Update now" button would actually apply it, if at all. */
  method: "self" | "deploy-hook" | "manual";
  /** "self" only: why one click cannot install this release (then it is done by hand). */
  blocked?: string;
  /** "self" only: the files the last update replaced are kept, so it can be undone. */
  canRollback?: boolean;
  /** Why a check failed, when it did. Shown rather than swallowed. */
  error?: string;
  checkedAt: string;
}

/**
 * Compares two dotted versions.
 *
 * Deliberately not semver-complete: it handles `1.2.3` and ignores pre-release
 * suffixes, which is all a release feed for this project needs. Anything it
 * cannot parse compares as equal, so a malformed manifest never announces a
 * phantom update.
 */
export function isNewer(candidate: string, current: string): boolean {
  const parse = (v: string) =>
    String(v ?? "")
      .trim()
      .replace(/^v/i, "")
      .split(/[.-]/)
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isFinite(n));

  const a = parse(candidate);
  const b = parse(current);
  if (a.length === 0 || b.length === 0) return false;

  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

/**
 * The installer server.js provides (scripts/self-update.cjs): signed releases
 * from GitHub, swapped in place, with rollback. Absent under `next dev`/`start`.
 */
export interface SelfUpdate {
  signed: boolean;
  plan(): Promise<{ version: string; newer: boolean; tooOld: boolean; needsNpm: boolean; manifest: Record<string, unknown> }>;
  apply(): Promise<string>;
  rollback(): void;
  canRollback(): boolean;
}
export function selfUpdate(): SelfUpdate | null {
  const u = (globalThis as { __bmsUpdate?: SelfUpdate }).__bmsUpdate;
  return u && u.signed ? u : null;
}

/** Whether this deployment can apply an update by itself. */
export function updateMethod(): "self" | "deploy-hook" | "manual" {
  if (selfUpdate()) return "self";
  return process.env.DEPLOY_HOOK_URL ? "deploy-hook" : "manual";
}

/** A manifest's display fields, coerced: it is a remote file rendered as text. */
function releaseInfo(raw: Partial<ReleaseInfo>, version: string): ReleaseInfo {
  return {
    version,
    released: raw.released ? String(raw.released) : undefined,
    notes: Array.isArray(raw.notes) ? raw.notes.slice(0, 40).map((n) => String(n).slice(0, 300)) : undefined,
    url: typeof raw.url === "string" && /^https?:\/\//.test(raw.url) ? raw.url : undefined,
    critical: raw.critical === true,
  };
}

/**
 * Fetches the published release, if a manifest is configured.
 *
 * The manifest is a plain JSON file the maintainer publishes — a GitHub raw
 * URL, an S3 object, anything reachable. Keeping it a URL rather than baking in
 * a provider means this works the same whether releases live on GitHub, a
 * company server, or a file next to the site.
 */
export async function fetchRelease(): Promise<{ release: ReleaseInfo | null; error?: string }> {
  const url = (process.env.UPDATE_MANIFEST_URL ?? "").trim();
  if (!url) return { release: null, error: "No update source is configured." };

  try {
    // Never cached: the entire question is whether something changed remotely,
    // and a cached answer is the one answer that cannot help.
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!res.ok) return { release: null, error: `Update source returned ${res.status}.` };

    const raw = (await res.json()) as Partial<ReleaseInfo>;
    const version = String(raw?.version ?? "").trim().slice(0, 40);
    if (!version) return { release: null, error: "The update source has no version field." };

    return { release: releaseInfo(raw, version) };
  } catch (e) {
    const msg = e instanceof Error && e.name === "TimeoutError"
      ? "The update source timed out."
      : "Could not reach the update source.";
    return { release: null, error: msg };
  }
}

/** The whole answer the Updates screen needs, in one call. */
export async function getUpdateStatus(): Promise<UpdateStatus> {
  const self = selfUpdate();
  if (self) {
    try {
      const p = await self.plan();
      const release = releaseInfo(p.manifest as Partial<ReleaseInfo>, p.version);
      return {
        current: CURRENT_VERSION,
        latest: p.version,
        updateAvailable: p.newer,
        release,
        method: "self",
        blocked: !p.newer
          ? undefined
          : p.tooOld
            ? `This release needs at least version ${String(p.manifest.min)}, so it is installed by hand.`
            : p.needsNpm
              ? "This release adds new packages, so it is installed by hand (upload the zip, then Run NPM Install and Restart in cPanel)."
              : undefined,
        canRollback: self.canRollback(),
        checkedAt: new Date().toISOString(),
      };
    } catch (e) {
      return {
        current: CURRENT_VERSION, latest: null, updateAvailable: false, release: null, method: "self",
        canRollback: self.canRollback(),
        error: e instanceof Error ? e.message : "Could not check for updates.",
        checkedAt: new Date().toISOString(),
      };
    }
  }

  const { release, error } = await fetchRelease();
  return {
    current: CURRENT_VERSION,
    latest: release?.version ?? null,
    updateAvailable: !!release && isNewer(release.version, CURRENT_VERSION),
    release,
    method: updateMethod(),
    error,
    checkedAt: new Date().toISOString(),
  };
}
