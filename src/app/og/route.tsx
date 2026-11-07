import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { NextRequest } from "next/server";
import type React from "react";
import { getSiteSettings } from "@/lib/settings";
import { ogImageVersion } from "@/lib/seoMeta";
import { ARABIC_SCRIPT, arabicFont } from "@/lib/ogFont";
import { LS_CACHE } from "@/lib/lscache";
import { clientIp, rateLimited } from "@/lib/rateLimit";
import { ogSignatureValid } from "@/lib/ogSign";

/**
 * A share image generated from the title, at /og?title=…
 *
 * Used when a page has no image of its own and no default has been set — the
 * case that used to share with no picture at all, which on every social
 * network means a small grey card nobody taps. This draws the title on the
 * site's primary colour with the site name and logo, 1200×630.
 *
 * Arabic-script titles work: Cairo is loaded for them (see ogFont.ts) and the
 * words are laid out right-to-left by hand (see Words below).
 *
 * Cached for a year — the URL carries the title and a version of the theme
 * settings, so a changed title or colour is a new URL, never a stale image.
 */
export const runtime = "nodejs";

/**
 * Public and unauthenticated, and each render costs real CPU (satori + resvg,
 * a few hundred milliseconds on a shared host). The cache only helps for
 * titles the site actually emits; a stranger sending a thousand different
 * titles gets a thousand renders. A crawler fetches one image per page and
 * nothing legitimate needs more than this.
 */
const RENDER_LIMIT = { max: 30, windowMs: 60_000 };

/**
 * The logo as something the renderer can draw: a small PNG data URI.
 *
 * Satori (inside ImageResponse) decodes PNG, JPEG, GIF and SVG only. A WebP
 * logo — which is what the upload optimiser produces from almost anything —
 * made every render throw "u2 is not iterable", so on the first live site
 * `/og` answered 500 to every request, Googlebot-Image included, while it
 * worked on a machine with no logo on disk. Converting with sharp covers
 * WebP and AVIF, and shrinks a 600px logo to the 112px it is drawn at (56px
 * at 2x). SVG passes through; anything that cannot be read is dropped
 * rather than taking the image down with it.
 */
async function logoDataUri(logoUrl: string): Promise<string | null> {
  if (!logoUrl) return null;
  let bytes: Buffer | null = null;
  try {
    if (logoUrl.startsWith("/uploads/")) {
      bytes = await readFile(path.join(process.cwd(), "public", logoUrl));
    } else if (/^https?:\/\//.test(logoUrl)) {
      const res = await fetch(logoUrl, { signal: AbortSignal.timeout(5000), cache: "no-store" });
      if (res.ok) bytes = Buffer.from(await res.arrayBuffer());
    }
  } catch {
    return null;
  }
  if (!bytes) return null;
  if (/\.svg(\?|$)/i.test(logoUrl)) return `data:image/svg+xml;base64,${bytes.toString("base64")}`;
  try {
    const sharp = (await import("sharp")).default;
    const png = await sharp(bytes).resize(112, 112, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  if (rateLimited("og-render", clientIp(req), RENDER_LIMIT)) {
    return new Response("Too many requests", { status: 429, headers: { "Retry-After": "60", "Cache-Control": "no-store" } });
  }
  const settings = await getSiteSettings();
  const askedTitle = (req.nextUrl.searchParams.get("title") ?? "").trim().slice(0, 140);
  const askedKicker = (req.nextUrl.searchParams.get("kicker") ?? "").trim().slice(0, 60);
  // Only text the site itself signed is drawn. Anything else — a stranger's
  // words, or a link from a page cached before signing existed — gets the
  // plain card with the site's name, still a valid image, never their text.
  const signed = ogSignatureValid(askedTitle, askedKicker, req.nextUrl.searchParams.get("s"));
  const title = (signed ? askedTitle : "") || settings.site_name || "Untitled";
  const kicker = signed ? askedKicker : "";
  const siteName = settings.site_name || "";
  const primary = /^#[0-9a-f]{6}$/i.test(settings.color_primary || "") ? settings.color_primary : "#0ea5e9";

  // The logo as a data URI, read from disk: the renderer would otherwise have
  // to fetch it over the network from the site's own public address, which a
  // shared host cannot always do.
  const logo = await logoDataUri(settings.site_logo || "");

  // Text that reads on the background. The card is drawn on the primary
  // colour, and a site whose primary is white (the first live site's is)
  // got white text on near-white — an image, technically, with nothing
  // legible on it.
  const light = luminance(primary) > 0.55;
  const ink = light ? "#0f172a" : "#ffffff";
  const rule = light ? "rgba(15,23,42,.35)" : "rgba(255,255,255,.55)";

  const rtl = ARABIC_SCRIPT.test(`${title} ${kicker} ${siteName}`);
  const long = title.length > 70;

  // Arabic script: an explicit font the renderer can shape (see ogFont.ts).
  // Latin: the renderer's own bundled font.
  const arabic = rtl ? await arabicFont() : null;
  const fontFamily = arabic ? "Cairo" : "sans-serif";

  const render = (withLogo: boolean) => new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px 72px",
          background: `linear-gradient(135deg, ${primary} 0%, ${shade(primary, -35)} 100%)`,
          color: ink,
          fontFamily,
        }}
      >
        <div style={{ display: "flex", flexDirection: rtl ? "row-reverse" : "row", alignItems: "center", gap: 20 }}>
          {withLogo && logo && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="" width={56} height={56} style={{ borderRadius: 12, objectFit: "contain", background: "rgba(255,255,255,.15)" }} />
          )}
          {siteName && <Words text={siteName} rtl={rtl} style={{ fontSize: 30, fontWeight: 600, opacity: 0.92 }} />}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 18, alignItems: rtl ? "flex-end" : "flex-start" }}>
          {kicker && <Words text={kicker} rtl={rtl} style={{ fontSize: 26, opacity: 0.8, textTransform: rtl ? "none" : "uppercase", letterSpacing: rtl ? 0 : 2 }} />}
          <Words text={title} rtl={rtl} style={{ fontSize: long ? 52 : 64, fontWeight: 700, lineHeight: 1.2 }} />
        </div>
        <div style={{ display: "flex", justifyContent: rtl ? "flex-end" : "flex-start" }}>
          <div style={{ height: 10, width: 220, background: rule, borderRadius: 999 }} />
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      ...(arabic ? { fonts: [{ name: "Cairo", data: arabic, weight: 700 as const, style: "normal" as const }] } : {}),
    }
  );

  // The response ImageResponse builds is immutable-headers; copy it with ours.
  // A render that fails with the logo is retried without it: a share image
  // missing its logo is still a share image, a 500 is a grey card.
  let body: ArrayBuffer;
  try {
    body = await render(true).arrayBuffer();
  } catch (err) {
    if (!logo) throw err;
    body = await render(false).arrayBuffer();
  }
  return new Response(body, {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
      // Every distinct title/kicker/theme combination is its own URL, so
      // LiteSpeed can serve this straight from its own cache — the renderer
      // (an ImageResponse render pulling a font file) never has to run twice
      // for the same share image.
      [LS_CACHE]: "public, max-age=31536000",
      "X-OG-Version": ogImageVersion(settings),
    },
  });
}

/**
 * A run of text, laid out for its direction.
 *
 * The renderer shapes Arabic letters correctly but does not reorder words:
 * `direction: rtl` right-aligns a line whose words still run left-to-right,
 * which reads backwards. Making each word a flex item in a wrapping
 * `row-reverse` row gives exactly the flow an RTL paragraph has — first word
 * at the far right, wrapping onto the next line from the right — using
 * layout the renderer does support. Latin text is left as one block.
 *
 * Consecutive non-Arabic words stay together as one left-to-right run: a
 * title like "ياسين تيفي Yacine TV" reversed word by word came out as
 * "TVYacine". Spacing is padding on each item — the renderer ignored an
 * `em` gap, which also left the Arabic words unevenly spaced.
 */
function Words({ text, rtl, style }: { text: string; rtl: boolean; style: React.CSSProperties }) {
  if (!rtl) return <div style={style}>{text}</div>;
  const runs: string[] = [];
  let latin: string[] = [];
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (ARABIC_SCRIPT.test(w)) {
      if (latin.length) runs.push(latin.join(" "));
      latin = [];
      runs.push(w);
    } else {
      latin.push(w);
    }
  }
  if (latin.length) runs.push(latin.join(" "));
  return (
    <div style={{ ...style, display: "flex", flexDirection: "row-reverse", flexWrap: "wrap", justifyContent: "flex-start" }}>
      {runs.map((w, i) => (
        <span key={i} style={{ padding: "0 0.14em" }}>{w}</span>
      ))}
    </div>
  );
}

/** Relative luminance of a `#rrggbb` colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

/** Lightens (positive) or darkens (negative) a #rrggbb colour by a percentage. */
function shade(hex: string, percent: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + (percent / 100) * (percent > 0 ? 255 - c : c))));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
