// A local font sized like the site's chosen heading and body fonts, so the page
// does not move when the real font arrives (font-display: swap): PageSpeed
// counted the reflowed hero as layout shift on every site. Same numbers Next's
// next/font uses (capsize metrics: Arial for sans, Times New Roman for serif),
// precomputed per Google family in fontFallbackMetrics.json as
// [size-adjust, ascent, descent, line-gap, serif]. Server-side only: the table
// stays out of every browser bundle. The family lists in siteCss.ts name
// "<family> Fallback" after each chosen font; a family with no row here is skipped.
import metrics from "./fontFallbackMetrics.json";

const table = metrics as unknown as Record<string, [number, number, number, number, number]>;
const LOCAL = { 0: 'local("Arial"),local("ArialMT"),local("Liberation Sans"),local("Helvetica")', 1: 'local("Times New Roman"),local("TimesNewRomanPSMT"),local("Liberation Serif"),local("Times")' } as const;

export function fontFallbackCss(s: Record<string, string>): string {
  const faces: string[] = [];
  for (const value of [s.font_heading || "Inter", s.font_body || "Inter"]) {
    const family = value.trim();
    const m = table[family.toLowerCase()];
    if (!m) continue;
    const name = `${family} Fallback`;
    if (!faces.some((f) => f.includes(`"${name}"`))) {
      faces.push(`@font-face{font-family:"${name}";src:${LOCAL[m[4] as 0 | 1]};size-adjust:${m[0]}%;ascent-override:${m[1]}%;descent-override:${m[2]}%;line-gap-override:${m[3]}%}`);
    }
  }
  return faces.join("");
}
