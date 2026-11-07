// Comparing a secret a caller supplied against the one we expect.
//
// `timingSafeEqual` throws — it does not return false — when the two buffers
// differ in byte length, so every caller has to length-check first. Three
// routes did that on the *string* length and then built buffers from it:
//
//     given.length !== expected.length || !timingSafeEqual(Buffer.from(given), Buffer.from(expected))
//
// Those are not the same number. One non-ASCII character in the token makes a
// string of n characters more than n bytes, so a request could match on string
// length, fail on byte length, and throw a RangeError out of a guard whose
// whole purpose was to answer 404 without revealing that the endpoint exists.
// The caller then returns a 500 with a stack instead.
//
// `loginProof.ts` and `passwordReset.ts` already compared buffer lengths; this
// is that version, in one place, for the token routes to share.

import { timingSafeEqual } from "node:crypto";

/**
 * Whether `given` matches `secret`, in constant time for equal-length input.
 *
 * Returns false rather than throwing for anything malformed — a comparison
 * that can throw is a comparison that can leak a different status code.
 *
 * `minLength` refuses a secret too short to be worth checking: an empty or
 * two-character `CRON_TOKEN` in the environment should disable the endpoint,
 * not guard it.
 */
export function secretMatches(secret: string, given: string, minLength = 16): boolean {
  if (!secret || !given) return false;
  const a = Buffer.from(secret, "utf8");
  const b = Buffer.from(given, "utf8");
  if (a.length < minLength || a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * The secret the cron routes accept.
 *
 * CRON_TOKEN when it is set. BACKUP_TOKEN is still accepted when it is not,
 * because sites already have a cron pointed at the publish route with that
 * token and switching it off would silently stop scheduled posts — but Site
 * Health warns about it: a token that sits in a crontab line every five
 * minutes should not also be the one that can write backups.
 */
export function cronSecret(): string {
  return (process.env.CRON_TOKEN || process.env.BACKUP_TOKEN || "").trim();
}

/**
 * The token a request presents: `Authorization: Bearer …` first, then an
 * `x-cron-token` header, then `?token=`.
 *
 * A query string is written into every access log on the way in; a header is
 * not. The query form keeps working for crons already set up with it.
 */
export function presentedToken(req: { headers: Headers; nextUrl: URL }, header = "x-cron-token"): string {
  const auth = req.headers.get("authorization") ?? "";
  const bearer = /^Bearer\s+(.+)$/i.exec(auth)?.[1];
  return (bearer ?? req.headers.get(header) ?? req.nextUrl.searchParams.get("token") ?? "").trim();
}
