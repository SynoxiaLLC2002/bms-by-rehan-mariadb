// A very small per-IP throttle for the endpoints anyone can POST to.
//
// Written twice already — once in the comment route and once in the form
// handler, with different window sizes and the same sweep logic copied by hand.
// A third caller (the 404 logger) had none at all, which is how a public write
// endpoint ends up with an unbounded table behind it. One implementation, three
// callers, each naming its own limits.
//
// In-memory means per instance rather than global. That is the right trade
// here: it costs nothing, needs no storage, and a single-server deploy gets
// real protection. A serverless fan-out gets proportionally less, which is
// still more than none.

export interface RateLimit {
  /** Requests allowed inside the window. */
  max: number;
  windowMs: number;
}

/** One bucket per limiter, so callers cannot share each other's counters. */
const buckets = new Map<string, Map<string, number[]>>();

/**
 * Records a hit and says whether the caller has gone over.
 *
 * `name` separates the counters: a visitor leaving a comment should not use up
 * their allowance for reporting a broken link.
 */
export function rateLimited(name: string, key: string, { max, windowMs }: RateLimit): boolean {
  let bucket = buckets.get(name);
  if (!bucket) {
    bucket = new Map<string, number[]>();
    buckets.set(name, bucket);
  }

  const now = Date.now();
  const hits = (bucket.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  bucket.set(key, hits);

  // Cheap sweep so the map cannot grow without bound on a long-lived process.
  if (bucket.size > 5000) {
    for (const [k, times] of bucket) {
      if (times.every((t) => now - t >= windowMs)) bucket.delete(k);
    }
  }

  return hits.length > max;
}

/**
 * The caller's address, as far as it can be trusted.
 *
 * Behind Cloudflare the visitor can send their own `x-forwarded-for`. Cloudflare
 * *appends* the real address, so the first entry is whatever they typed and
 * every login / form / comment limit could be skipped by rotating a fake one.
 * `cf-connecting-ip` is set by Cloudflare and is the one to believe. Without
 * it (local, or a host that is not behind Cloudflare) we fall back to
 * `x-real-ip`, then the last `x-forwarded-for` hop (what a honest proxy
 * appends), then the first hop.
 */
export function clientIp(req: { headers: { get(name: string): string | null } }): string {
  const cf = (req.headers.get("cf-connecting-ip") ?? "").trim();
  if (cf) return cf;
  const trueClient = (req.headers.get("true-client-ip") ?? "").trim();
  if (trueClient) return trueClient;
  const real = (req.headers.get("x-real-ip") ?? "").trim();
  if (real) return real;
  const hops = (req.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (hops.length === 0) return "unknown";
  return hops[hops.length - 1] ?? hops[0] ?? "unknown";
}
