// next/link without the router: a plain anchor. Next-only props are dropped.
import { forwardRef, type AnchorHTMLAttributes } from "react";

type Href = string | { pathname?: string; query?: Record<string, string>; hash?: string };
type Props = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: Href;
  prefetch?: unknown; replace?: unknown; scroll?: unknown; shallow?: unknown; passHref?: unknown; legacyBehavior?: unknown; locale?: unknown;
};

function toHref(h: Href): string {
  if (typeof h === "string") return h;
  const q = h.query ? "?" + new URLSearchParams(h.query).toString() : "";
  return (h.pathname ?? "") + q + (h.hash ? `#${h.hash}` : "");
}

const Link = forwardRef<HTMLAnchorElement, Props>(function Link(
  { href, prefetch: _p, replace: _r, scroll: _s, shallow: _sh, passHref: _ph, legacyBehavior: _l, locale: _lo, ...rest },
  ref
) {
  return <a ref={ref} href={toHref(href)} {...rest} />;
});
export default Link;
