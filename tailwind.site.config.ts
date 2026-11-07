import type { Config } from "tailwindcss";
import base from "./tailwind.config";

/**
 * Tailwind for the public site only.
 *
 * `tailwind.config.ts` scans `src/app/**` and `src/components/**`, which is
 * every screen of the admin — and the result was one stylesheet, imported by
 * the admin and the public site alike. A visitor reading an article was
 * downloading the utility classes for the media library, the editor and the
 * Speed screen, and since `experimental.inlineCss` puts that stylesheet in
 * the document, paying for it again on every page with no cache to fall back
 * on. It measured 61.5 KB of CSS in the head of every page, and PageSpeed put
 * 1,040 ms of the homepage's LCP into "element render delay" — the time the
 * browser spends parsing CSS and computing styles before it can paint.
 *
 * So the public site gets its own build, scanned only over what the public
 * site can actually render. The admin keeps the original config untouched:
 * the risk of a narrower scan is a class that goes missing, and a missing
 * class in the admin is a bug the owner sees, while a missing class here is
 * one a visitor sees. Only one of those is worth taking on at a time.
 *
 * Anything reachable from a public page belongs in `content` below. When a
 * frontend component starts importing from somewhere new, add it here, or the
 * class will simply not be in the stylesheet.
 */
const config: Config = {
  ...base,
  content: [
    "./src/app/(site)/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/(author)/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/(preview)/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/frontend/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/shared/**/*.{js,ts,jsx,tsx,mdx}",
    // Block defaults and helpers hold class strings too, and `lib` is shared
    // rather than admin-shaped, so it is cheaper to scan than to debug.
    "./src/lib/**/*.{js,ts}",
  ],
};

export default config;
