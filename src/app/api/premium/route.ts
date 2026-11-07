import { NextRequest, NextResponse } from "next/server";
import { sessionAuth as auth } from "@/lib/auth"; // never an API token (lib/apiTokens.ts)
import { isAdmin, FORBIDDEN, UNAUTHORIZED } from "@/lib/authz";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { getSiteSettings } from "@/lib/settings";
import { siteUrl } from "@/lib/siteUrl";
import {
  PREMIUM_SERVER,
  PREVIEW_KEY,
  checkLicense,
  previewOpen,
  previewPasswordOk,
  previewProof,
  isPremiumFeature,
  premiumDomain,
  premiumKeys,
  writePremiumSettings,
} from "@/lib/premium";

// The lock on a premium feature (lib/premium.ts has the whole story).
//
// This route never talks to synoxia.org. The admin screen does that from the
// browser, and reports back here: "I sent a request, remember its number" and
// "here is the key I was given". The key is the only thing believed, and only
// after its signature has been checked.

async function admin() {
  const session = await auth();
  if (!session?.user?.id) return { error: NextResponse.json(UNAUTHORIZED, { status: 401 }) };
  if (!isAdmin(session)) return { error: NextResponse.json(FORBIDDEN, { status: 403 }) };
  return { session };
}

export async function GET(req: NextRequest) {
  const a = await admin();
  if (a.error) return a.error;
  const feature = req.nextUrl.searchParams.get("feature");
  if (!isPremiumFeature(feature)) return NextResponse.json({ error: "Unknown feature." }, { status: 400 });

  const settings = await getSiteSettings();
  // Behind the preview lock the screen is told one thing: ask for the password.
  if (!previewOpen(settings)) return NextResponse.json({ previewLocked: true }, { headers: { "Cache-Control": "no-store" } });
  const k = premiumKeys(feature);
  const domain = premiumDomain(settings);
  const license = settings[k.license] ?? "";
  const check = license ? checkLicense(license, feature, domain) : null;
  return NextResponse.json(
    {
      server: PREMIUM_SERVER,
      domain,
      siteUrl: siteUrl(settings),
      siteName: settings.site_name ?? "",
      adminEmail: a.session.user?.email ?? "",
      adminName: a.session.user?.name ?? "",
      unlocked: !!check?.ok,
      // A saved key that no longer fits: the site moved to another domain.
      licenseError: check && !check.ok ? check.error : "",
      request: settings[k.requestId]
        ? { id: settings[k.requestId], token: settings[k.requestToken] ?? "", at: settings[k.requestAt] ?? "" }
        : null,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function POST(req: NextRequest) {
  const a = await admin();
  if (a.error) return a.error;
  if (rateLimited("premium", clientIp(req), { max: 30, windowMs: 10 * 60 * 1000 })) {
    return NextResponse.json({ error: "Too many tries. Wait a few minutes, then try again." }, { status: 429 });
  }
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (!isPremiumFeature(b.feature)) return NextResponse.json({ error: "Unknown feature." }, { status: 400 });
  const k = premiumKeys(b.feature);

  // The preview lock (lib/premium.ts). A wrong password costs a try, and there are few:
  // this is the one place a password could be guessed at.
  if (b.action === "preview") {
    if (rateLimited("premium-preview", clientIp(req), { max: 5, windowMs: 15 * 60 * 1000 })) {
      return NextResponse.json({ error: "Too many tries. Wait fifteen minutes, then try again." }, { status: 429 });
    }
    if (!previewPasswordOk(String(b.password ?? ""))) return NextResponse.json({ ok: false, error: "That password is not right." }, { status: 403 });
    await writePremiumSettings({ [PREVIEW_KEY]: previewProof() });
    return NextResponse.json({ ok: true });
  }
  // "Lock it again": the password is asked for on the next visit.
  if (b.action === "relock") {
    await writePremiumSettings({ [PREVIEW_KEY]: "" });
    return NextResponse.json({ ok: true });
  }
  if (!previewOpen(await getSiteSettings())) return NextResponse.json({ error: "This feature is not available yet." }, { status: 403 });

  // "My request was received": keep its number so the screen can ask about it later.
  if (b.action === "requested") {
    const id = String(b.id ?? "");
    const token = String(b.token ?? "");
    if (!/^[a-f0-9]{8,64}$/.test(id) || !/^[a-f0-9]{16,128}$/.test(token)) {
      return NextResponse.json({ error: "The request was sent, but its receipt could not be read. Do not pay again; contact Rehan with your payment screenshot." }, { status: 400 });
    }
    await writePremiumSettings({ [k.requestId]: id, [k.requestToken]: token, [k.requestAt]: new Date().toISOString() });
    return NextResponse.json({ ok: true });
  }

  // "Here is my key": from the status check, or pasted by hand.
  if (b.action === "activate") {
    const license = String(b.license ?? "").trim();
    const check = checkLicense(license, b.feature, premiumDomain(await getSiteSettings()));
    if (!check.ok) return NextResponse.json({ ok: false, error: check.error }, { status: 400 });
    await writePremiumSettings({ [k.license]: license, [k.requestId]: "", [k.requestToken]: "", [k.requestAt]: "" });
    return NextResponse.json({ ok: true });
  }

  // "Forget my request": it was refused, and they want to send another.
  if (b.action === "forget") {
    await writePremiumSettings({ [k.requestId]: "", [k.requestToken]: "", [k.requestAt]: "" });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
