"use client";

import { useEffect } from "react";

/**
 * Adds `.is-stuck` to the header once the page scrolls past it, which is the one
 * piece of sticky styling CSS cannot express on its own. SiteLayout only renders
 * this when a distinct stuck appearance has been configured.
 */
export default function StickyHeader() {
  useEffect(() => {
    const headers = Array.from(document.querySelectorAll<HTMLElement>("header.hdr-desktop, header.hdr-mobile, header.hdr-both"));
    if (!headers.length) return;

    // A zero-height sentinel above the header: when it leaves the viewport we're stuck.
    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.cssText = "position:absolute;top:0;height:1px;width:1px;pointer-events:none";
    document.body.prepend(sentinel);

    const io = new IntersectionObserver(
      ([entry]) => headers.forEach((h) => h.classList.toggle("is-stuck", !entry.isIntersecting)),
      { threshold: 0 }
    );
    io.observe(sentinel);

    return () => {
      io.disconnect();
      sentinel.remove();
      headers.forEach((h) => h.classList.remove("is-stuck"));
    };
  }, []);

  return null;
}
