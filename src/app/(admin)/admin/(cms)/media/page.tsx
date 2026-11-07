import { db } from "@/lib/db";
import { media } from "@/lib/db/schema";
import { count, desc } from "drizzle-orm";
import MediaLibraryClient, { type MediaItem } from "./MediaLibraryClient";

// Same page size as GET /api/media's default — the client asks for that
// route's own default when it loads page 2+, so the two must agree or the
// list would skip or repeat rows at the page boundary.
const PAGE_SIZE = 60;

/**
 * Server-rendered first page, so opening the Media Library shows files
 * immediately instead of a "Loading…" flash followed by a client round trip
 * to the same data the server already has.
 */
export default async function MediaPage() {
  const [rows, [counted]] = await Promise.all([
    db.query.media.findMany({ orderBy: [desc(media.createdAt)], limit: PAGE_SIZE }),
    db.select({ n: count() }).from(media),
  ]);

  const items: MediaItem[] = rows.map((r) => ({
    id: r.id,
    filename: r.filename,
    originalName: r.originalName,
    url: r.url,
    mimeType: r.mimeType,
    size: r.size,
    alt: r.alt,
    caption: r.caption,
    createdAt: r.createdAt.toISOString(),
  }));
  const total = counted?.n ?? items.length;

  return (
    <MediaLibraryClient
      initialItems={items}
      initialTotal={total}
      initialHasMore={items.length < total}
    />
  );
}
