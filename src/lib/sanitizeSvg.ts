// Makes an uploaded SVG safe to serve from the site's own origin.
//
// An SVG is a document, not a picture: it can carry <script>, event handler
// attributes, links to javascript:, and <foreignObject> with arbitrary HTML
// inside. Served from public/uploads it runs with the site's origin, so an
// uploaded icon could read an administrator's session the moment they opened
// its URL. That is why SVG was refused entirely until now.
//
// This is an allowlist of what an icon or logo legitimately needs — shapes,
// paths, gradients, text, groups, styles — and everything else is dropped.
// It is deliberately conservative: an SVG that uses a filter primitive we did
// not list renders without it, which is a worse icon, not a security hole.
// Anything that fails to parse as a single <svg> document is rejected.

const ALLOWED_TAGS = new Set([
  "svg", "g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "text", "tspan", "textPath", "title", "desc", "defs", "symbol", "use", "clipPath",
  "mask", "pattern", "marker", "linearGradient", "radialGradient", "stop", "image",
  "style", "filter", "feGaussianBlur", "feOffset", "feBlend", "feColorMatrix",
  "feFlood", "feComposite", "feMerge", "feMergeNode", "feDropShadow", "metadata",
]);

const URL_ATTRS = new Set(["href", "xlink:href", "src"]);

export interface SanitizedSvg {
  svg: string;
  /** What was removed, for the upload response. Empty means untouched. */
  removed: string[];
}

function safeUrl(value: string): boolean {
  const v = value.trim().toLowerCase();
  // Same-document references (#id) and inline data images only. No http(s),
  // no javascript:, no external files of any kind.
  return v.startsWith("#") || v.startsWith("data:image/");
}

export function sanitizeSvg(input: string): SanitizedSvg | null {
  let s = input.replace(/^﻿/, "").trim();
  // A single root <svg>; anything else is not an image.
  const start = s.search(/<svg[\s>]/i);
  if (start === -1 || !/<\/svg>\s*$/i.test(s)) return null;
  // Leading XML declaration and DOCTYPE are fine; entities in a DOCTYPE are
  // not (billion laughs). Drop the DOCTYPE entirely.
  s = s.replace(/<!DOCTYPE[^>]*(\[[\s\S]*?\])?[^>]*>/gi, "");
  s = s.slice(s.search(/<svg[\s>]/i));

  const removed: string[] = [];

  // Comments and CDATA wrappers (a script hiding inside CDATA in <style>).
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");

  // Whole elements that are never acceptable, with their contents.
  for (const tag of ["script", "foreignObject", "iframe", "object", "embed", "animate", "set", "animateTransform", "animateMotion", "a"]) {
    const re = new RegExp(`<${tag}\\b[\\s\\S]*?<\\/${tag}\\s*>|<${tag}\\b[^>]*\\/?>`, "gi");
    if (re.test(s)) {
      removed.push(`<${tag}>`);
      s = s.replace(re, "");
    }
  }

  // Any other element not on the allowlist: strip the tags, keep children.
  s = s.replace(/<\/?([a-zA-Z][\w:-]*)\b([^>]*)>/g, (whole, name: string, attrs: string) => {
    if (!ALLOWED_TAGS.has(name)) {
      if (!removed.includes(`<${name}>`)) removed.push(`<${name}>`);
      return "";
    }
    if (whole.startsWith("</")) return whole;
    // Attributes: no event handlers, no unsafe URLs, no external stylesheets.
    // `[\s/]`, not `\s`: a solidus separates attributes just as a space does,
    // so `<rect x="1"/onload=alert(1)/>` put a live handler past a rule that
    // only looked for whitespace. The root `<svg/onload=…>` form was already
    // refused earlier (the opening tag must be `<svg` + space or `>`), which
    // is why this only ever showed up on a child element.
    const cleaned = attrs.replace(/[\s/]+([a-zA-Z_:][\w:.-]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/g, (m, attr: string, _q, dq, sq, bare) => {
      const a = attr.toLowerCase();
      const value = dq ?? sq ?? bare ?? "";
      if (a.startsWith("on")) {
        if (!removed.includes(`${attr} attribute`)) removed.push(`${attr} attribute`);
        return "";
      }
      if (URL_ATTRS.has(a) && !safeUrl(value)) {
        if (!removed.includes(`external ${attr}`)) removed.push(`external ${attr}`);
        return "";
      }
      if (a === "style" && /url\s*\(|expression\s*\(|@import|javascript:/i.test(value)) {
        removed.push("style with url()");
        return "";
      }
      return m;
    });
    return `<${name}${cleaned}>`;
  });

  // <style> blocks: no @import, no url() to anything but #ids, no javascript.
  s = s.replace(/<style\b([^>]*)>([\s\S]*?)<\/style>/gi, (m, attrs: string, css: string) => {
    const cleaned = css
      .replace(/@import[^;]*;?/gi, () => {
        removed.push("@import");
        return "";
      })
      .replace(/url\s*\(\s*(['"]?)(?!#)[^)]*\)/gi, () => {
        removed.push("url() in style");
        return "none";
      })
      .replace(/javascript:/gi, "");
    return `<style${attrs}>${cleaned}</style>`;
  });

  if (!/<svg[\s>]/i.test(s) || !/<\/svg>/i.test(s)) return null;
  return { svg: s, removed };
}
