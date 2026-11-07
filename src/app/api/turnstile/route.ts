import { NextResponse } from "next/server";
import { turnstileEnabled, turnstileSiteKey } from "@/lib/turnstile";

// The Turnstile site key as the server sees it *now*.
//
// The widget used to read NEXT_PUBLIC_TURNSTILE_SITE_KEY, which Next bakes
// into the browser bundle at build time, while the server decided from the
// host's runtime settings whether a token is required. Add the keys in cPanel
// after a build that lacked them and visitors got no widget while every
// comment and contact form was refused as "complete the verification". The
// widget asks here instead, so both sides always agree.

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(
    { siteKey: turnstileEnabled() ? turnstileSiteKey() : "" },
    { headers: { "Cache-Control": "public, max-age=300" } }
  );
}
