// The `rel` a link gets, in one place.
//
// Seven renderers used to spell this out themselves, and drifted: the App
// Info download button sent `noopener` without `noreferrer`, the icon list
// added `noopener` to every https link whether or not it opened a new tab.
// A new-tab link needs `noopener` — without it the opened page holds
// `window.opener` and can navigate this one (tabnabbing) — and gets
// `noreferrer` with it, the belt to that brace. `nofollow` is the author's
// choice, never inferred: a download link is not automatically one a site
// wants to disown.

export function linkRel(opts: { newTab?: boolean; nofollow?: boolean; sponsored?: boolean; ugc?: boolean }): string | undefined {
  const parts: string[] = [];
  if (opts.newTab) parts.push("noopener", "noreferrer");
  if (opts.nofollow) parts.push("nofollow");
  if (opts.sponsored) parts.push("sponsored");
  if (opts.ugc) parts.push("ugc");
  return parts.length ? parts.join(" ") : undefined;
}

/** Props for an anchor that may open in a new tab: `target` and `rel` together, so neither is forgotten. */
export function newTabProps(newTab: boolean, extra: { nofollow?: boolean } = {}): { target?: "_blank"; rel?: string } {
  return { target: newTab ? "_blank" : undefined, rel: linkRel({ newTab, ...extra }) };
}

/**
 * The site-wide policy for links in *content* that leave the site — the ones
 * an author pastes into a paragraph, where the editor offers no per-link
 * `rel`. Built once per render from SEO settings (`externalLinkPolicy`) and
 * applied by `externalLinkProps`.
 */
export interface ExternalLinkPolicy {
  /** `rel="nofollow"` on outbound links (SEO → Titles & Meta → Links). */
  nofollow: boolean;
  /** Hosts exempt from `nofollow`, lower-case, without `www.`. */
  exclude: Set<string>;
  /** Open outbound links in a new tab. */
  newTab: boolean;
  /** This site's own host, so an absolute link to itself is not "external". */
  ownHost: string;
}

export const DEFAULT_LINK_POLICY: ExternalLinkPolicy = { nofollow: false, exclude: new Set(), newTab: true, ownHost: "" };

const bareHost = (h: string) => h.toLowerCase().replace(/^www\./, "");

export function externalLinkPolicy(
  s: { seo_nofollow_external?: string; seo_nofollow_exclude?: string; seo_external_new_tab?: string },
  siteOrigin: string
): ExternalLinkPolicy {
  let ownHost = "";
  try { ownHost = bareHost(new URL(siteOrigin).hostname); } catch { /* no origin configured */ }
  return {
    nofollow: s.seo_nofollow_external === "true",
    exclude: new Set((s.seo_nofollow_exclude ?? "").split(/[\s,]+/).map((h) => bareHost(h.replace(/^https?:\/\//, "").split("/")[0])).filter(Boolean)),
    newTab: s.seo_external_new_tab !== "false",
    ownHost,
  };
}

/** `target`/`rel` for one content link under the policy. Relative links and links to this host get nothing. */
export function externalLinkProps(href: string, policy: ExternalLinkPolicy): { target?: "_blank"; rel?: string } {
  if (!/^https?:\/\//i.test(href)) return {};
  let host = "";
  try { host = bareHost(new URL(href).hostname); } catch { return {}; }
  if (host && host === policy.ownHost) return {};
  const nofollow = policy.nofollow && !policy.exclude.has(host);
  return newTabProps(policy.newTab, nofollow ? { nofollow } : {});
}
