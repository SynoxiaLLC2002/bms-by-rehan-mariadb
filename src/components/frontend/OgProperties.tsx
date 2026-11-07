/**
 * Open Graph tags Next's metadata API has no field for.
 *
 * `og:updated_time` and `article:publisher` are read from `property="…"`,
 * like every Open Graph tag. `metadata.other` is the only escape hatch the
 * API offers and it writes `name="…"`, so both were on every page and seen
 * by no scraper. React hoists a `<meta>` rendered anywhere in the tree into
 * `<head>`, which is the one way to write `property` from a page.
 */
export default function OgProperties({
  updatedAt,
  publisher,
}: {
  /** The document's last change — `og:updated_time`. */
  updatedAt?: Date | string | null;
  /** The site's Facebook page URL — `article:publisher`. Articles only. */
  publisher?: string | null;
}) {
  const time = updatedAt ? new Date(updatedAt) : null;
  const page = (publisher ?? "").trim();
  return (
    <>
      {time && !Number.isNaN(time.getTime()) && <meta property="og:updated_time" content={time.toISOString()} />}
      {page && <meta property="article:publisher" content={page} />}
    </>
  );
}
