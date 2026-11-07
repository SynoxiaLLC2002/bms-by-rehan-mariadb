// Signed upload addresses: a local file into the media library without base64.
//
// Through the connector, an image could only arrive as a public URL or as
// base64 text — a 40 KB cover is 54,000 characters of a tool call, too big to
// send. The connector's create_upload_url returns
//   <site>/api/media/direct?t=<claim>.<signature>
// and `curl --upload-file cover.jpg "<that>"` puts the file in the library,
// through the same route and checks as an upload in the admin
// (app/api/media/direct/route.ts runs app/api/media POST as the token's owner).
//
// The claim names the API token, the file name and type, and an expiry 15
// minutes out; it is signed with the site's secret, so it cannot be altered or
// made by anyone else. The token itself never appears in the address. At use,
// the token must still exist and be unexpired, and acts with its role at that
// moment (lib/apiTokens.ts sessionForTokenId): revoking it kills its addresses.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { authSecret } from "@/lib/authSecret";

export const UPLOAD_URL_MINUTES = 15;

export interface UploadClaim {
  /** api_tokens.id of the token that asked. */
  tid: number;
  /** File name, as the library will store it. */
  n: string;
  /** MIME type. */
  m: string;
  /** Expiry, ms since epoch. */
  e: number;
}

const sign = (body: string) => createHmac("sha256", `${authSecret()}:media-upload`).update(body).digest("base64url");

export function makeUploadClaim(tokenId: number, filename: string, mime: string): string {
  const claim: UploadClaim & { r: string } = { tid: tokenId, n: filename, m: mime, e: Date.now() + UPLOAD_URL_MINUTES * 60_000, r: randomBytes(6).toString("base64url") };
  const body = Buffer.from(JSON.stringify(claim)).toString("base64url");
  return `${body}.${sign(body)}`;
}

/** The claim, or null when it is malformed, forged or expired. */
export function readUploadClaim(t: string): UploadClaim | null {
  const [body, sig] = String(t || "").split(".");
  if (!body || !sig || body.length > 2000) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as UploadClaim;
    if (!Number.isInteger(c.tid) || typeof c.n !== "string" || typeof c.m !== "string" || typeof c.e !== "number") return null;
    return c.e > Date.now() ? c : null;
  } catch {
    return null;
  }
}
