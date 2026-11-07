// Fonts for generated share images.
//
// The image renderer ships a Latin font and can fetch others on demand — but
// the Arabic font it fetches on its own (Noto Sans Arabic) uses an OpenType
// feature its shaper does not support, and the render throws. Cairo does not
// have that problem, has good Latin glyphs too, and is the default look of a
// great many Arabic sites. So when a title contains Arabic script, Cairo is
// fetched once from Google Fonts (as TTF — the renderer reads TTF, not WOFF2),
// kept in memory for the life of the process, and passed in explicitly, which
// also stops the renderer trying its own broken download.

const TTL_MS = 24 * 60 * 60 * 1000;
let cached: { data: ArrayBuffer; at: number } | null = null;
let inFlight: Promise<ArrayBuffer | null> | null = null;

export const ARABIC_SCRIPT = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

export async function arabicFont(): Promise<ArrayBuffer | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    try {
      // A bare user agent is what makes Google answer with TTF URLs.
      const css = await (
        await fetch("https://fonts.googleapis.com/css2?family=Cairo:wght@700&display=swap", {
          headers: { "user-agent": "curl/8" },
          signal: AbortSignal.timeout(6000),
        })
      ).text();
      const url = css.match(/url\((https:[^)]+\.ttf)\)/)?.[1];
      if (!url) return null;
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) return null;
      const data = await res.arrayBuffer();
      cached = { data, at: Date.now() };
      return data;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
}
