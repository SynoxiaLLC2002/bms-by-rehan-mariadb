import { db } from "@/lib/db";
import { posts } from "@/lib/db/schema";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { ilike } from "@/lib/db/sql";
import type { SearchPost } from "@/components/frontend/SearchResults";
import { isLive } from "@/lib/publishState";

/** Results per page of the search archive. */
export const SEARCH_PER_PAGE = 24;
/**
 * The most matches ever counted or paged through — ten pages. Nobody reads
 * page eleven of site search, and every id past this is a longer scan for
 * nothing; the count then reads "240+" rather than a number we never checked.
 */
const MAX_MATCHES = SEARCH_PER_PAGE * 10;

/**
 * A visitor's words as a MariaDB boolean-mode query: every word required.
 *
 * Postgres's websearch_to_tsquery ANDed the words, which `+word` does here.
 * Boolean mode gives meaning to + - < > ( ) ~ * " @, so those are removed
 * from what a visitor typed rather than passed through as operators. Words
 * shorter than innodb_ft_min_token_size (3 on the host) are not in the index
 * and would make a required term impossible, so they are left to the
 * substring pass. Returns "" when nothing indexable is left.
 */
function booleanQuery(q: string): string {
  const words = q
    .replace(/[+\-<>()~*"@]/g, " ")
    .split(/\s+/)
    .filter((w) => [...w].length >= 3)
    .slice(0, 10);
  return words.map((w) => `+${w}`).join(" ");
}

/**
 * The longest query worth running.
 *
 * `q` arrives straight from the query string with nothing between it and the
 * database, and the substring pass below scans the full body text of every
 * post in the language. A caller is not owed an unbounded pattern.
 */
const MAX_QUERY = 120;

/**
 * A visitor's words as a LIKE pattern, with the pattern language escaped out.
 *
 * `%` and `_` are wildcards, so without this a search for "100%" matched every
 * post and "snake_case" matched "snakeXcase". Worse, a query of alternating
 * `%_%_%_…` makes the matcher backtrack across every article body on the site,
 * which is a slow page anyone can ask for. Backslash is escaped first, or it
 * would escape the escapes.
 */
function likePattern(value: string): string {
  return `%${value.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
}

/**
 * Whether the FULLTEXT index exists.
 *
 * Assumed true, disproved once. See the catch below.
 */
let fullTextAvailable = true;

/**
 * Searches published posts across title, excerpt and body.
 *
 * Body text lives in `search_text` (flattened from the BlockNote JSON on save)
 * and is covered, with title and excerpt, by the FULLTEXT index
 * `posts_search_ft`, so this stays fast as the archive grows. Those columns
 * compare without case or accents (utf8mb4_uca1400_ai_ci), so Arabic with or
 * without harakat matches. Full-text only matches whole words, so a
 * substring pass runs as a fallback for partial terms like "conten".
 *
 * Scoped to one language, like every other listing: searching from a French
 * page returned English posts, which is content the reader cannot use and which
 * partitioning is supposed to keep apart.
 */
export { likePattern, MAX_QUERY };

/** A query the substring fallback is for: at most two words, none very long. */
function substringWorthTrying(q: string): boolean {
  const words = q.split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 2 && q.length <= 40 && words.every((w) => w.length <= 25);
}

/** Searches one visitor may run per minute (see the search page). */
export const SEARCH_RATE = { max: 20, windowMs: 60_000 };

export async function searchPosts(query: string, language: string): Promise<SearchPost[]> {
  return (await searchPostsPage(query, language, 1)).posts;
}

export interface SearchPage {
  posts: SearchPost[];
  /** Matches found, up to MAX_MATCHES. */
  total: number;
  /** True when there were more than `total` — the count is then a floor. */
  capped: boolean;
  totalPages: number;
}

const CARD_COLUMNS = { id: true, title: true, slug: true, excerpt: true, featuredImage: true, publishedAt: true, createdAt: true, language: true } as const;

/**
 * One page of results, in relevance order.
 *
 * The matching ids are found once, ranked, and only the page's own rows are
 * loaded — so page 3 costs one id scan and 24 card rows, not 72.
 */
export async function searchPostsPage(query: string, language: string, page: number): Promise<SearchPage> {
  const q = query.trim().slice(0, MAX_QUERY);
  const empty: SearchPage = { posts: [], total: 0, capped: false, totalPages: 0 };
  if (!q) return empty;

  const ids = await matchIds(q, language);
  if (ids.length === 0) return empty;
  const capped = ids.length > MAX_MATCHES;
  const all = capped ? ids.slice(0, MAX_MATCHES) : ids;
  const totalPages = Math.ceil(all.length / SEARCH_PER_PAGE);
  const n = Math.min(Math.max(1, Math.floor(page) || 1), totalPages);
  const pageIds = all.slice((n - 1) * SEARCH_PER_PAGE, n * SEARCH_PER_PAGE);

  const rows = await db.query.posts.findMany({
    where: (p, { inArray }) => inArray(p.id, pageIds),
    with: { category: true },
    // SearchPost carries card fields only; `content` would be dead weight.
    columns: CARD_COLUMNS,
  });
  // Preserve relevance order, which the second query loses.
  const order = new Map(pageIds.map((id, i) => [id, i]));
  rows.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  return { posts: rows as unknown as SearchPost[], total: all.length, capped, totalPages };
}

/** Every matching id, best first, up to one past MAX_MATCHES. */
async function matchIds(q: string, language: string): Promise<number[]> {
  const LIMIT = MAX_MATCHES + 1;
  // The substring pass still runs when full-text returns nothing, so a
  // partial term like "conten" keeps working.
  const boolean = booleanQuery(q);
  let ids: number[] = [];
  if (fullTextAvailable && boolean) {
    // The column list must be exactly the index's, or MariaDB refuses MATCH.
    const match = sql`MATCH(${posts.title}, ${posts.excerpt}, ${posts.searchText}) AGAINST (${boolean} IN BOOLEAN MODE)`;
    try {
      const ranked = await db
        .select({ id: posts.id, rank: sql<number>`${match}` })
        .from(posts)
        .where(and(isLive(posts), eq(posts.language, language), match))
        .orderBy(sql`${match} DESC`, desc(posts.publishedAt))
        .limit(LIMIT);
      ids = ranked.map((r) => r.id);
    } catch (err) {
      // The FULLTEXT index comes from the baseline migration. Where it is
      // missing, MATCH throws and would take the whole search page down with
      // a 500 — though the substring pass below would have answered. One
      // failure disables the attempt for the life of the process, so a
      // missing index costs one error rather than one per search. Only a
      // missing index disables it for good (ER_FT_MATCHING_KEY_NOT_FOUND); a
      // timeout or a dropped connection is not a reason to lose ranked
      // search until the next restart.
      if (/FULLTEXT|1191/i.test(String((err as Error)?.message ?? "") + String((err as { errno?: unknown })?.errno ?? ""))) fullTextAvailable = false;
      console.warn("[search] full-text unavailable, falling back to substring:", (err as Error).message);
    }
  }

  if (ids.length > 0) return ids;

  // The substring pass reads the full text of every live article in the
  // language — no index can serve `%…%` — so it costs a whole-table scan in
  // CPU and database compute. It exists for a partial word ("conten"); a
  // long or many-word query that full-text did not match is almost always a
  // bot's random string, and each one was a free table scan. Only short,
  // few-word queries get it.
  if (!substringWorthTrying(q)) return [];

  // Nothing matched whole-word — try a substring pass so partial terms still work.
  const like = likePattern(q);
  const rows = await db
    .select({ id: posts.id })
    .from(posts)
    .where(
      and(
        isLive(posts),
        eq(posts.language, language),
        or(ilike(posts.title, like), ilike(posts.excerpt, like), ilike(posts.searchText, like))
      )
    )
    .orderBy(desc(posts.publishedAt), desc(posts.id))
    .limit(LIMIT);
  return rows.map((r) => r.id);
}
