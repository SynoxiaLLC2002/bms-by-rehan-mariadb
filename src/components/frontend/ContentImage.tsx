// The featured image on a post or a page — the LCP element on almost every
// content view, and until now a plain `<img>` serving whatever the author
// uploaded at full size.
//
// `next/image` gives it AVIF/WebP conversion and a responsive srcset, which is
// the single biggest render-time win available on those pages. It cannot simply
// be dropped in, though: the optimiser refuses any host outside
// `images.remotePatterns`, and it refuses it by *throwing* — so one author
// pasting a featured-image URL from another site would take the whole page down
// rather than degrade. `featuredImage` is a free-text column, so that is a real
// input, not a hypothetical one.
//
// Hence the split: uploads (same-origin `/uploads/...`, or the blob host this
// CMS writes to) go through the optimiser; anything else renders as the plain
// tag it renders as today. No input can crash the page, and the common case
// gets the win.

import Image from "next/image";

/** Hosts `images.remotePatterns` in `next.config.ts` actually allows. */
const OPTIMISABLE_HOST = /\.public\.blob\.vercel-storage\.com$/i;

/**
 * Whether the optimiser will accept this source.
 *
 * A relative path is same-origin and always allowed. An absolute URL is only
 * allowed if its host is configured — and a URL we cannot even parse is
 * certainly not.
 */
function canOptimise(src: string): boolean {
  if (src.startsWith("/") && !src.startsWith("//")) return true;
  try {
    const url = new URL(src);
    return url.protocol === "https:" && OPTIMISABLE_HOST.test(url.hostname);
  } catch {
    return false;
  }
}

export default function ContentImage({
  src,
  alt,
  className,
  /** Set on the LCP image so the browser fetches it before anything else. */
  priority = false,
  /** Speed → Media → "Lazy-load images". Off, every image loads with the page. */
  lazy = true,
  /** Speed → Media → "Image quality"; the optimiser's default is 75. */
  quality = 75,
  width = 1200,
  height = 675,
  /**
   * How wide this image actually renders, so the browser can pick a candidate
   * that fits.
   *
   * The default suits a full-width image in the content column. A card in a
   * three-up grid is closer to 380px, and serving it an 800px candidate wastes
   * most of the bytes the optimiser just saved — which is why this is a prop
   * rather than a constant.
   */
  // On a phone the column has 16px of padding each side: saying so lets the
  // browser pick one candidate smaller on high-density screens.
  sizes = "(max-width: 768px) calc(100vw - 32px), 800px",
  /**
   * Inline styles, for callers whose appearance is computed rather than
   * classed — the advanced image block sets object-fit, a height and CSS
   * filters from its own settings, none of which can be a static class.
   */
  style,
  blurDataURL,
}: {
  src: string;
  alt: string;
  className?: string;
  priority?: boolean;
  lazy?: boolean;
  quality?: number;
  width?: number;
  height?: number;
  sizes?: string;
  style?: React.CSSProperties;
  /** The blurred placeholder from the media library, shown while the file loads. */
  blurDataURL?: string;
}) {
  if (!src) return null;

  if (!canOptimise(src)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={className}
        // The same intrinsic hint the optimised branch gets. Without it an
        // image from another site had no box until it arrived, and everything
        // below it jumped. The browser keeps this ratio only until the real
        // one is known, and CSS still decides the displayed size.
        width={width}
        height={height}
        style={style}
        decoding="async"
        fetchPriority={priority ? "high" : undefined}
        loading={priority || !lazy ? "eager" : "lazy"}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      className={className}
      style={style}
      // Intrinsic hints for the aspect ratio; the CSS class decides the real
      // display size, exactly as it did for the `<img>` this replaced.
      width={width}
      height={height}
      priority={priority}
      // The plain `<img>` branch above has always said this; the optimised one
      // did not, and they are the same component. `priority` alone only writes
      // the `<link rel=preload>` — this version of Next derives no
      // `fetchpriority` from it — so the LCP image was preloaded and then
      // fetched at the browser's default priority anyway, which is exactly what
      // a Lighthouse "LCP request discovery" audit reports.
      {...(priority ? { fetchPriority: "high" as const } : {})}
      {...(!priority && !lazy ? { loading: "eager" as const } : {})}
      quality={quality}
      // The content column is capped well below full width on every layout, so
      // the browser should never pick the largest candidate on a wide screen.
      sizes={sizes}
      // A blurred preview in the image's place until it arrives — only when
      // the upload recorded one and the box has a size to hold it.
      {...(blurDataURL && width && height ? { placeholder: "blur" as const, blurDataURL } : {})}
    />
  );
}
