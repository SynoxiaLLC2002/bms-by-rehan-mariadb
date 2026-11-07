import Link from "next/link";
import { archiveText } from "@/lib/archiveText";

/**
 * Page links for an archive.
 *
 * Page 1 lives at the base URL and later pages at `<base>/page/2`, so
 * the first page keeps its canonical address instead of gaining a `/page/1`
 * duplicate that search engines would have to reconcile.
 */
export default function Pagination({
  base,
  page,
  totalPages,
  style = "numbers",
  label = "Load more",
  language = "en",
  rtl = false,
  hrefFor,
}: {
  base: string;
  page: number;
  totalPages: number;
  /** Load more / infinite: the numbers stay for crawlers; a script swaps them out. */
  style?: "numbers" | "loadmore" | "infinite";
  label?: string;
  /** The listing's language, for the two words and the landmark's name. */
  language?: string;
  /** Right-to-left: "previous" is then the arrow pointing the other way. */
  rtl?: boolean;
  /** Overrides the `/page/N` addresses — search pages by query string. */
  hrefFor?: (n: number) => string;
}) {
  if (totalPages <= 1) return null;

  // `base` may be the site root — "/" — and "//page/2" is not a URL.
  const stem = base === "/" ? "" : base.replace(/\/$/, "");
  const href = hrefFor ?? ((n: number) => (n === 1 ? base : `${stem}/page/${n}`));

  // Show first, last, current and its neighbours; gaps become an ellipsis.
  const shown = new Set<number>([1, totalPages, page - 1, page, page + 1]);
  // Both words were English on every site, and both arrows pointed the way a
  // left-to-right page reads — so an Arabic archive said "← Previous" with the
  // arrow aimed at the next page.
  const t = archiveText(language);
  const back = rtl ? "→" : "←";
  const forward = rtl ? "←" : "→";
  const pages = Array.from(shown)
    .filter((n) => n >= 1 && n <= totalPages)
    .sort((a, b) => a - b);

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-12" aria-label={t.pagination} data-pagination data-style={style} data-label={label}>
      {page > 1 && (
        <Link href={href(page - 1)} rel="prev" className="px-3 py-2 text-sm rounded-lg border border-black/10 hover:border-black/25 transition-colors">
          {back} {t.prev}
        </Link>
      )}

      {pages.map((n, i) => {
        const gap = i > 0 && n - pages[i - 1] > 1;
        return (
          <span key={n} className="flex items-center gap-1.5">
            {gap && <span className="px-1 opacity-40">…</span>}
            {n === page ? (
              <span aria-current="page" className="px-3.5 py-2 text-sm rounded-lg font-semibold text-white" style={{ backgroundColor: "var(--color-primary,#0ea5e9)" }}>
                {n}
              </span>
            ) : (
              <Link href={href(n)} className="px-3.5 py-2 text-sm rounded-lg border border-black/10 hover:border-black/25 transition-colors">
                {n}
              </Link>
            )}
          </span>
        );
      })}

      {page < totalPages && (
        <Link href={href(page + 1)} rel="next" className="px-3 py-2 text-sm rounded-lg border border-black/10 hover:border-black/25 transition-colors">
          {t.next} {forward}
        </Link>
      )}
    </nav>
  );
}
