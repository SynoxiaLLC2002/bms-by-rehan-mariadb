// Click-to-play video embeds.
//
// A YouTube iframe costs the visitor roughly half a megabyte of script and a
// dozen requests before they have decided whether to watch — on a page with
// two videos that is most of the page weight, and it all lands during the
// first seconds, when the page is trying to paint. The facade shows what the
// iframe would show (the thumbnail and a play button) as one image, and only
// builds the real player when the visitor clicks. Nothing is lost: the click
// autoplays, so it feels the same as clicking the embedded player.
//
// Used in two places: the Video Embed block, and any YouTube/Vimeo iframe an
// author pasted into an HTML block. Both produce the same markup, and one
// small script (FACADE_SCRIPT, inlined once per page) swaps it for the iframe.

import { escapeHtml } from "@/lib/utils";

export interface FacadeTarget {
  provider: "youtube" | "vimeo";
  id: string;
  /** The iframe src the click builds, autoplay added. */
  embed: string;
  /** Preview image; YouTube hosts one per video, Vimeo needs a lookup. */
  poster: string | null;
}

/** What to show for a video URL or embed URL, or null when it is not one we know. */
export function facadeTarget(url: string): FacadeTarget | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/);
  if (yt) {
    const id = yt[1];
    const start = url.match(/[?&](?:t|start)=(\d+)/)?.[1];
    return {
      provider: "youtube",
      id,
      // youtube-nocookie keeps the visitor out of YouTube's tracking until they play.
      embed: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0${start ? `&start=${start}` : ""}`,
      poster: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    };
  }
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) {
    const id = vimeo[1];
    return {
      provider: "vimeo",
      id,
      embed: `https://player.vimeo.com/video/${id}?autoplay=1`,
      // vumbnail.com serves Vimeo posters without an API key; if it is ever
      // down the facade still works, just without a picture.
      poster: `https://vumbnail.com/${id}.jpg`,
    };
  }
  return null;
}

/**
 * The facade element. A <button>, so it is focusable and announced as one;
 * the poster is a plain lazy image, the play mark is CSS-only.
 */
export function facadeHtml(
  t: FacadeTarget,
  title: string,
  className = "",
  /** The play button’s accessible name, in the page’s language. English when
   *  a caller has no settings to hand — `facadeIframes` rewrites author HTML
   *  and is not given one. */
  words: { playVideo: string; playVideoTitled: (title: string) => string } = {
    playVideo: "Play video",
    playVideoTitled: (x) => `Play video: ${x}`,
  }
): string {
  const label = title ? words.playVideoTitled(title) : words.playVideo;
  return (
    `<button type="button" class="bms-video ${className}" data-embed="${escapeHtml(t.embed)}" data-title="${escapeHtml(title || "Video")}" aria-label="${escapeHtml(label)}">` +
    (t.poster ? `<img src="${escapeHtml(t.poster)}" alt="" loading="lazy" decoding="async" width="480" height="360">` : "") +
    `<span class="bms-video-play" aria-hidden="true"></span>` +
    `</button>`
  );
}

/**
 * Replaces YouTube/Vimeo iframes inside author HTML with facades. Anything
 * else in the HTML is left exactly as it was.
 */
export function facadeIframes(html: string): string {
  if (!html || !/<iframe/i.test(html)) return html;
  return html.replace(/<iframe\b[^>]*\bsrc=["']([^"']+)["'][^>]*>\s*<\/iframe>/gi, (whole, src: string) => {
    const t = facadeTarget(src);
    if (!t) return whole;
    const title = whole.match(/\btitle=["']([^"']*)["']/i)?.[1] ?? "";
    const w = whole.match(/\bwidth=["']?(\d+)/i)?.[1];
    const h = whole.match(/\bheight=["']?(\d+)/i)?.[1];
    const ratio = w && h && Number(h) > 0 ? ` style="aspect-ratio:${w}/${h}"` : "";
    return `<div class="bms-video-wrap"${ratio}>${facadeHtml(t, title)}</div>`;
  });
}

/** Styles for the facade; shipped with the site stylesheet. */
export const FACADE_CSS = `
.bms-video-wrap{position:relative;width:100%;aspect-ratio:16/9;margin:1.5rem 0;border-radius:.75rem;overflow:hidden;background:#000}
.bms-video{position:absolute;inset:0;width:100%;height:100%;display:block;padding:0;border:0;background:#000;cursor:pointer}
.bms-video img{width:100%;height:100%;object-fit:cover;display:block;opacity:.92;transition:opacity .2s}
.bms-video:hover img{opacity:1}
.bms-video-play{position:absolute;left:50%;top:50%;width:68px;height:48px;margin:-24px 0 0 -34px;border-radius:14px;background:rgba(0,0,0,.75);transition:background .2s}
.bms-video:hover .bms-video-play,.bms-video:focus-visible .bms-video-play{background:#f00}
.bms-video-play::after{content:"";position:absolute;left:27px;top:14px;border-style:solid;border-width:10px 0 10px 18px;border-color:transparent transparent transparent #fff}
.bms-video:focus-visible{outline:3px solid #60a5fa;outline-offset:-3px}
.bms-video-wrap iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
`.trim();

/** One delegated click handler; the iframe is built only then. */
export const FACADE_SCRIPT =
  `document.addEventListener('click',function(e){var b=e.target&&e.target.closest?e.target.closest('.bms-video[data-embed]'):null;if(!b)return;e.preventDefault();var f=document.createElement('iframe');f.src=b.getAttribute('data-embed');f.title=b.getAttribute('data-title')||'Video';f.setAttribute('allow','accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share');f.setAttribute('allowfullscreen','');f.setAttribute('frameborder','0');f.className='w-full h-full';var p=b.parentNode;p.replaceChild(f,b);try{f.focus()}catch(_){}},false);`;
