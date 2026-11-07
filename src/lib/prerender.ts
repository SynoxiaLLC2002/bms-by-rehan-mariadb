// How much of the site `next build` renders ahead of time.
//
// The build rendered every post, tag and category against the live database,
// so build time grew with the archive — a few thousand posts is a build that
// outlasts a shared host's patience and the owner's. Past these counts a page
// renders on its first visit instead and is cached from then on exactly like
// a prerendered one (`dynamicParams` is on), so visitors see no difference.
// The newest content is what gets prerendered, which is what gets visited.
//
// BUILD_PRERENDER_LIMIT overrides the post count at build time.

export const PRERENDER_POSTS = Math.max(0, parseInt(process.env.BUILD_PRERENDER_LIMIT ?? "", 10) || 300);
export const PRERENDER_TERMS = 200;

/**
 * A build with no database renders nothing ahead of time. Release zips are
 * built that way (scripts/publish-release.mjs): one zip is installed on every
 * site, and pages prerendered from the build's database would be served on all
 * of them until the cache expired. Every site renders its own on first visit.
 */
export const BUILD_WITHOUT_DATABASE = process.env.NEXT_PHASE === "phase-production-build" && !process.env.DATABASE_URL;
