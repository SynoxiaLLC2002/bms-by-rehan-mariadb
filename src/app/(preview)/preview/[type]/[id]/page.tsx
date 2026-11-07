import type { Metadata } from "next";
import { getSiteSettings } from "@/lib/settings";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { canEditDocument, isAuthor } from "@/lib/authz";
import BlockRenderer from "@/components/frontend/BlockRenderer";
import ContentShell from "@/components/frontend/ContentShell";
import PostTitleBlock from "@/components/frontend/PostTitleBlock";
import type { Block } from "@blocknote/core";
import { getPreviewPage, getPreviewPost } from "@/lib/previewDoc";
import { getPreviewDraft, PREVIEW_FIELDS } from "@/lib/previewDrafts";
import { pagePath, postPath } from "@/lib/permalinks";

// Always render fresh — previews must reflect the latest (possibly draft) content.
export const dynamic = "force-dynamic";

function asBlocks(value: unknown): Block[] {
  if (Array.isArray(value)) return value as Block[];
  if (value && typeof value === "object" && Array.isArray((value as { content?: unknown }).content)) {
    return (value as { content: Block[] }).content;
  }
  return [];
}

function overlayDraft<T extends { content?: unknown }>(saved: T, draft: Record<string, unknown> | null): T {
  if (!draft) return saved;
  const next: Record<string, unknown> = { ...saved };
  for (const key of PREVIEW_FIELDS) {
    if (!(key in draft)) continue;
    if (key === "content") next.content = asBlocks(draft.content);
    else next[key] = draft[key];
  }
  if (!Array.isArray(next.content)) next.content = saved.content;
  return next as T;
}

function safeJson(value: unknown): string | undefined {
  try {
    return JSON.stringify(value);
  } catch {
    return undefined;
  }
}

function RetryBanner() {
  return (
    // English chrome inside a document whose direction may be RTL — see the
    // same note in error.tsx.
    <div dir="ltr" className="mx-auto max-w-xl px-4 py-24 text-center">
      <p className="mb-4 text-7xl font-bold opacity-50">…</p>
      <h1 className="mb-3 text-3xl font-bold">This preview is taking too long</h1>
      <p className="mb-8 opacity-60">The live site is fine. Refresh this tab — the host was slow talking to the database.</p>
    </div>
  );
}

/**
 * The tab title a visitor will see: the SEO title, or the document title.
 * The preview had none, so the connector's render_document always reported an
 * empty TITLE. Same access rule as the page: no title for a document this
 * session may not open (an author must not read another's draft title here).
 */
export async function generateMetadata({ params }: { params: Promise<{ type: string; id: string }> }): Promise<Metadata> {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) return {};
  const { type, id } = await params;
  const numId = parseInt(id);
  if (Number.isNaN(numId) || (type !== "post" && type !== "page")) return {};
  const lookup = type === "post" ? await getPreviewPost(numId) : await getPreviewPage(numId);
  const doc = lookup.doc as { title?: string; seoTitle?: string | null; seoDescription?: string | null; authorId?: string | null } | null;
  if (!doc || (type === "post" ? !canEditDocument(session, doc.authorId) : isAuthor(session))) return {};
  const title = (doc.seoTitle || doc.title || "").trim();
  return { ...(title ? { title: { absolute: title } } : {}), ...(doc.seoDescription ? { description: doc.seoDescription } : {}) };
}

export default async function PreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ type: string; id: string }>;
  searchParams: Promise<{ draft?: string }>;
}) {
  const session = await auth().catch(() => null);
  if (!session?.user?.id) redirect("/admin/login");
  const { draft: draftToken } = await searchParams;

  const { type, id } = await params;
  const numId = parseInt(id);
  if (!["post", "page"].includes(type) || Number.isNaN(numId)) notFound();

  const banner = (
    <div className="bg-amber-400 text-amber-950 text-center text-sm font-semibold py-2 px-4 sticky top-0 z-50">
      Preview mode — this is how the {type} will look once published.
    </div>
  );

  if (type === "post") {
    const [lookup, settings] = await Promise.all([
      getPreviewPost(numId),
      getSiteSettings(),
    ]);
    if (lookup.failed) return RetryBanner();
    if (!lookup.doc) notFound();
    // A preview is a full read of the document, drafts included — the same
    // rule as opening it in the editor, or an author could read any draft on
    // the site by changing the id in this URL.
    if (!canEditDocument(session, lookup.doc.authorId)) notFound();
    const post = overlayDraft(lookup.doc, getPreviewDraft(draftToken, "post", numId, session.user.id));

    const hideTitle = post.showTitle === "disable";
    const hideFeaturedImg = post.showFeaturedImage === "disable";
    const titleAbove = settings.post_title_layout === "above-content";
    const blocks = asBlocks(post.content);
    let currentPath: string | undefined;
    try {
      currentPath = postPath(post, settings);
    } catch {
      currentPath = undefined;
    }

    return (
      <>
        {banner}
        <ContentShell
          design={post}
          kind="post"
          language={post.language}
          direction={post.direction}
          currentPath={currentPath}
          documentContent={safeJson(blocks)}
          customCss={post.customCss}
          scriptHead={post.scriptHead}
          scriptBodyEnd={post.scriptBodyEnd}
        >
          {!hideTitle && (
            <div className={titleAbove ? "post-title-above mb-10" : "post-title-in"}>
              <PostTitleBlock
                title={post.title}
                excerpt={post.excerpt}
                publishedAt={post.publishedAt ?? post.updatedAt}
                category={post.category}
                authorName={post.author?.name ?? null}
              />
            </div>
          )}
          {!hideFeaturedImg && typeof post.featuredImage === "string" && post.featuredImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.featuredImage} alt={post.title} className="content-feature w-full aspect-video object-cover rounded-xl mb-10" />
          )}
          <div className="max-w-none">
            <BlockRenderer blocks={blocks} language={post.language} direction={post.direction} />
          </div>
        </ContentShell>
      </>
    );
  }

  // Authors have no pages — see the pages API.
  if (isAuthor(session)) notFound();
  const lookup = await getPreviewPage(numId);
  if (lookup.failed) return RetryBanner();
  if (!lookup.doc) notFound();
  const page = overlayDraft(lookup.doc, getPreviewDraft(draftToken, "page", numId, session.user.id));
  const hideTitle = page.showTitle === "disable";
  const hideFeaturedImg = page.showFeaturedImage === "disable";
  const blocks = asBlocks(page.content);
  const settings = await getSiteSettings();
  let currentPath: string | undefined;
  try {
    currentPath = pagePath(page, settings);
  } catch {
    currentPath = undefined;
  }
  return (
    <>
      {banner}
      <ContentShell
        design={page}
        kind="page"
        language={page.language}
        direction={page.direction}
        currentPath={currentPath}
        documentContent={safeJson(blocks)}
        customCss={page.customCss}
        scriptHead={page.scriptHead}
        scriptBodyEnd={page.scriptBodyEnd}
      >
        {!hideTitle && <h1 className="text-4xl font-bold mb-8">{page.title}</h1>}
        {!hideFeaturedImg && typeof page.featuredImage === "string" && page.featuredImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={page.featuredImage} alt={page.title} className="w-full aspect-video object-cover rounded-xl mb-10" />
        )}
        <div className="max-w-none">
          <BlockRenderer blocks={blocks} language={page.language} direction={page.direction} />
        </div>
      </ContentShell>
    </>
  );
}
