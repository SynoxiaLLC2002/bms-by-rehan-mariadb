// next/image for Astro: the same <img> Next writes — `srcset` through
// `/_next/image` (served by the BMS Worker's front door, cf-worker.ts) — with
// none of Next's client code. Widths follow next.config.mjs (lib/logoSrc WIDTHS).
import type { ImgHTMLAttributes } from "react";
import { WIDTHS } from "@/lib/logoSrc";

const DEVICE = WIDTHS.filter((w) => w >= 640);

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, "src" | "width" | "height"> & {
  src: string | { src: string };
  width?: number | string;
  height?: number | string;
  fill?: boolean;
  priority?: boolean;
  quality?: number | string;
  placeholder?: unknown;
  blurDataURL?: string;
  loader?: unknown;
  unoptimized?: boolean;
};

const optimisable = (s: string) => s.startsWith("/uploads/") && !/\.(svg|gif)$/i.test(s);
const at = (src: string, w: number, q: number) => `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=${q}`;

export default function Image({ src, width, height, fill, priority, quality, placeholder, blurDataURL, loader: _l, unoptimized, sizes, style, ...rest }: Props) {
  const s = typeof src === "string" ? src : src.src;
  const q = Number(quality) || 75;
  const w = Number(width) || 0;
  let srcSet: string | undefined;
  let finalSrc = s;
  if (!unoptimized && optimisable(s)) {
    // Next's rule: with `sizes`, every width the layout could ask for; without,
    // the image's own width at 1x and 2x.
    if (sizes || fill || !w) {
      const ws = sizes ? WIDTHS : DEVICE;
      srcSet = ws.map((x) => `${at(s, x, q)} ${x}w`).join(", ");
      finalSrc = at(s, ws[ws.length - 1], q);
    } else {
      const pick = (t: number) => WIDTHS.find((x) => x >= t) ?? WIDTHS[WIDTHS.length - 1];
      const one = pick(w), two = pick(w * 2);
      srcSet = two > one ? `${at(s, one, q)} 1x, ${at(s, two, q)} 2x` : `${at(s, one, q)} 1x`;
      finalSrc = at(s, two, q);
    }
  }
  const blur = placeholder === "blur" && blurDataURL ? { backgroundImage: `url("${blurDataURL}")`, backgroundSize: "cover", backgroundPosition: "50% 50%", backgroundRepeat: "no-repeat" } : {};
  const fillStyle = fill ? { position: "absolute" as const, inset: 0, width: "100%", height: "100%" } : {};
  return (
    <img
      {...rest}
      src={finalSrc}
      srcSet={srcSet}
      sizes={sizes ?? (fill ? "100vw" : undefined)}
      width={fill ? undefined : width}
      height={fill ? undefined : height}
      loading={priority ? "eager" : rest.loading ?? "lazy"}
      fetchPriority={priority ? "high" : rest.fetchPriority}
      decoding="async"
      style={{ ...fillStyle, ...blur, ...style }}
    />
  );
}
