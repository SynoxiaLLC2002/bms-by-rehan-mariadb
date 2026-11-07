// BMS 2.0: runs every relational-query shape BMS uses against MariaDB and
// checks what comes back (lib/db/mariadbRelations.ts explains why this is
// needed). Uses an EMPTY test database and removes its rows afterwards.
//   DATABASE_URL=mysql://… node --experimental-strip-types scripts/check-relations.mts
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { db } from "../src/lib/db/index.ts";
import { closePool } from "../src/lib/db/pool.ts";
import { apiTokens, categories, comments, pages, postTags, posts, revisions, tags, users } from "../src/lib/db/schema.ts";

const userId = "check-relations-user";
await db.insert(users).values({ id: userId, email: "rel@example.test", name: "Ada", slug: "ada", publicProfile: true });
const [{ id: catId }] = await db.insert(categories).values({ name: "Mody", slug: "mody", language: "pl" }).$returningId();
const [{ id: postId }] = await db.insert(posts).values({ title: "Post", slug: "post", status: "published", language: "pl", categoryId: catId, authorId: userId, content: [{ type: "paragraph" }] }).$returningId();
const [{ id: lonePostId }] = await db.insert(posts).values({ title: "Lone", slug: "lone", status: "draft", language: "pl" }).$returningId();
const [{ id: pageId }] = await db.insert(pages).values({ title: "Page", slug: "page", language: "pl", authorId: userId }).$returningId();
const [{ id: tagId }] = await db.insert(tags).values({ name: "Tag", slug: "tag", language: "pl" }).$returningId();
await db.insert(postTags).values({ postId, tagId });
await db.insert(comments).values({ postId, authorName: "x", authorEmail: "x@x", content: "hi", status: "approved" });
await db.insert(revisions).values({ documentKind: "post", documentId: postId, title: "old", authorId: userId });
await db.insert(apiTokens).values({ userId, name: "t", tokenHash: "a".repeat(64), prefix: "bms_x" });

let failed = 0;
async function check(name: string, fn: () => Promise<void>) {
  try { await fn(); console.log("ok   ", name); } catch (err) { failed++; console.log("FAIL ", name, "—", (err as Error).message.slice(0, 300)); }
}

await check("post with category: true + author columns (post page)", async () => {
  const p = await db.query.posts.findFirst({
    where: eq(posts.id, postId),
    with: { category: { columns: { id: true, name: true, slug: true } }, author: { columns: { id: true, name: true, slug: true, publicProfile: true } } },
  });
  assert.equal(p?.category?.slug, "mody");
  assert.equal(p?.author?.name, "Ada");
  assert.equal(p?.author?.publicProfile, true);
  assert.deepEqual(p?.content, [{ type: "paragraph" }]);
});
await check("a post with no category or author gets null, not an error", async () => {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, lonePostId), with: { category: true, author: true } });
  assert.equal(p?.category, null);
  assert.equal(p?.author, null);
});
await check("findMany with category + extras + order + limit (archive)", async () => {
  const rows = await db.query.posts.findMany({ where: eq(posts.language, "pl"), with: { category: true }, orderBy: (t, { desc }) => [desc(t.id)], limit: 10 });
  assert.equal(rows.length, 2);
  assert.equal(rows.find((r) => r.id === postId)?.category?.name, "Mody");
});
await check("page with author columns (homepage, page route)", async () => {
  const pg = await db.query.pages.findFirst({ where: eq(pages.id, pageId), with: { author: { columns: { name: true } } } });
  assert.equal(pg?.author?.name, "Ada");
});
await check("postTags with tag (tags of a post)", async () => {
  const rows = await db.query.postTags.findMany({ where: eq(postTags.postId, postId), with: { tag: true } });
  assert.equal(rows[0]?.tag?.slug, "tag");
});
await check("comments with post columns (comment moderation)", async () => {
  const rows = await db.query.comments.findMany({ with: { post: { columns: { id: true, title: true, slug: true } } } });
  assert.equal(rows[0]?.post?.title, "Post");
});
await check("revisions with author (history)", async () => {
  const rows = await db.query.revisions.findMany({ where: eq(revisions.documentId, postId), with: { author: { columns: { name: true } } } });
  assert.equal(rows[0]?.author?.name, "Ada");
});
await check("api token with user (token sign-in)", async () => {
  const t = await db.query.apiTokens.findFirst({ with: { user: { columns: { id: true, email: true, role: true } } } });
  assert.equal(t?.user?.email, "rel@example.test");
});
await check("a many-relation with a limit is refused clearly", async () => {
  await assert.rejects(db.query.posts.findMany({ with: { comments: { limit: 1 } } }), /many-relation/);
});
await check("a plain many-relation works (no order/limit)", async () => {
  const p = await db.query.posts.findFirst({ where: eq(posts.id, postId), with: { tags: true } });
  assert.equal(p?.tags.length, 1);
});

for (const t of [apiTokens, revisions, comments, postTags, tags, pages, posts, categories]) await db.delete(t);
await db.delete(users).where(eq(users.id, userId));
await closePool();
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
