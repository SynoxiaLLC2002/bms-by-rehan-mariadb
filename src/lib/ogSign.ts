// Signs the text drawn on generated share images.
//
// `/og?title=…` draws whatever title it is given onto the site's own branded
// card, on the site's own domain. Unsigned, anyone could mint "official"
// images with their own words on them. The site signs the titles it emits;
// the route draws a title only when the signature matches.

import { createHmac, timingSafeEqual } from "node:crypto";

function key(): string {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "";
}

/** A short signature over exactly what will be drawn. */
export function ogSignature(title: string, kicker: string): string {
  const k = key();
  if (!k) return "";
  return createHmac("sha256", k).update(`og\u0000${title}\u0000${kicker}`).digest("base64url").slice(0, 22);
}

export function ogSignatureValid(title: string, kicker: string, given: string | null): boolean {
  const expected = ogSignature(title, kicker);
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}
