// Whether a document shows its featured image.
//
// The rule is the tri-state every document-level design setting uses: the
// document's own choice wins, and "default" follows the Customizer's toggle
// for that kind. It lives here because the routes were reading only half of
// it — `showFeaturedImage === "disable"` — so the site-wide switch was left to
// the stylesheet, which hides the image with `display:none` after the browser
// has already downloaded it.
//
// On a post that image is the `priority` one: it also carries a
// `<link rel=preload>` and `fetchpriority="high"`. So with the site-wide
// toggle off, every post fetched its largest image first, at the highest
// priority, to paint nothing.

import type { SiteSettings } from "./settings";

export function showsFeaturedImage(
  kind: "page" | "post",
  own: string | null | undefined,
  settings: SiteSettings
): boolean {
  if (own === "enable") return true;
  if (own === "disable") return false;
  const site = kind === "page" ? settings.page_feature_show : settings.post_feature_show;
  // Unset means shown: that is what the stylesheet does with a missing value,
  // and the two must agree or the image is fetched and then hidden again.
  return site !== "false";
}
