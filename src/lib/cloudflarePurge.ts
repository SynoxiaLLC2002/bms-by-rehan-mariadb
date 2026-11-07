// Purges Cloudflare's edge cache, the layer LiteSpeed's own purge cannot
// reach — LiteSpeed's `X-LiteSpeed-Purge` header only clears the origin
// server's cache. When a site sits behind Cloudflare (as most live sites do),
// a settings change can still take a while to show visitors: Cloudflare keeps
// serving whatever it cached at the edge, origin purge or not, until its own
// cache is told to drop it. Optional — only attempted when a zone id and API
// token are configured, since most installs (no Cloudflare, or a different
// CDN) have nothing to purge here.

export interface CloudflarePurgeResult {
  attempted: boolean;
  ok: boolean;
  error?: string;
}

async function purge(settings: Record<string, string>, body: Record<string, unknown>): Promise<CloudflarePurgeResult> {
  const zoneId = settings.cf_zone_id?.trim();
  const token = settings.cf_api_token?.trim();
  if (!zoneId || !token) return { attempted: false, ok: false };

  try {
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => null)) as { success?: boolean; errors?: { message?: string }[] } | null;
    if (res.ok && data?.success) return { attempted: true, ok: true };
    const message = data?.errors?.[0]?.message || `Cloudflare responded with ${res.status}.`;
    return { attempted: true, ok: false, error: message };
  } catch (err) {
    return { attempted: true, ok: false, error: err instanceof Error ? err.message : "Could not reach Cloudflare." };
  }
}

/** When the whole zone was last purged, shared by every bundle in the process. */
const state = globalThis as unknown as { __bmsCfAll?: number; __bmsCfTimer?: ReturnType<typeof setTimeout> | null };

/** Drops the whole zone — the manual Purge button and a settings change. */
export function purgeCloudflare(settings: Record<string, string>): Promise<CloudflarePurgeResult> {
  state.__bmsCfAll = Date.now();
  return purge(settings, { purge_everything: true });
}

/**
 * Purges the whole zone a moment from now, once, however many saves ask.
 *
 * Only Settings, the Purge button and publishing a post or page cleared
 * Cloudflare. Menus, Elements, categories, tags, redirects, comments and
 * profiles cleared LiteSpeed only, and Cloudflare kept serving the old
 * header, menu or footer for its whole cache lifetime — a day by default.
 * Every site-wide save goes through `revalidatePublicSite`, which calls this.
 *
 * Debounced (a Customizer session saves several times in a row) and skipped
 * when a full purge already ran in that window. Fire-and-forget: a save never
 * waits on Cloudflare, and never fails because of it.
 */
export function schedulePurgeCloudflare(delayMs = 1500): void {
  if (state.__bmsCfTimer) clearTimeout(state.__bmsCfTimer);
  const asked = Date.now();
  state.__bmsCfTimer = setTimeout(async () => {
    state.__bmsCfTimer = null;
    if ((state.__bmsCfAll ?? 0) >= asked) return;
    try {
      const { getSiteSettings } = await import("@/lib/settings");
      await purgeCloudflare(await getSiteSettings());
    } catch {
      // Best effort, like every other Cloudflare call here.
    }
  }, delayMs);
}

/**
 * Drops these URLs only — what a single publish needs. Cloudflare takes at
 * most 30 per call, so a long list goes in batches. Absolute URLs.
 */
export async function purgeCloudflareUrls(settings: Record<string, string>, urls: string[]): Promise<CloudflarePurgeResult> {
  const unique = [...new Set(urls)];
  if (unique.length === 0) return { attempted: false, ok: true };
  let last: CloudflarePurgeResult = { attempted: false, ok: true };
  for (let i = 0; i < unique.length; i += 30) {
    last = await purge(settings, { files: unique.slice(i, i + 30) });
    if (!last.ok) return last;
  }
  return last;
}
