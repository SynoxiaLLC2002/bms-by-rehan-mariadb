"use client";

import { useEffect, useRef, useState } from "react";

// The interactive halves of lib/siteExtras.ts. Client components rather than
// inline scripts because all three change the page: a script that runs before
// React hydrates edits HTML React is about to claim, React finds markup it did
// not render (error #418), re-renders the tree and throws the edits away.
// Effects run after hydration, so nothing is fighting over the DOM.

export function ScrollTopButton({ offset, label }: { offset: number; label: string }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      setShown(window.scrollY > offset);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [offset]);

  return (
    <button
      type="button"
      className={`bms-top${shown ? " is-shown" : ""}`}
      aria-label={label}
      tabIndex={shown ? 0 : -1}
      onClick={() => {
        const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduced ? "auto" : "smooth" });
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}

export function ReadingProgress() {
  const bar = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = bar.current;
      if (!el) return;
      // Through the article body when there is one, the whole page otherwise.
      const body = document.querySelector<HTMLElement>(".prose-content");
      let p: number;
      if (body) {
        const r = body.getBoundingClientRect();
        const total = r.height - window.innerHeight * 0.6;
        p = total > 0 ? (-r.top + window.innerHeight * 0.2) / total : 0;
      } else {
        const total = document.documentElement.scrollHeight - window.innerHeight;
        p = total > 0 ? window.scrollY / total : 0;
      }
      el.style.transform = `scaleX(${Math.min(1, Math.max(0, p))})`;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    // Measured on load only when the page did not open at the top (a restored
    // scroll, a #hash). At the top the bar is empty, which the stylesheet
    // already draws; measuring anyway forced a layout in the middle of
    // hydration — one of PageSpeed's "forced reflow" entries.
    if (window.scrollY > 0) onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);
  return (
    <div className="bms-progress" aria-hidden="true">
      <span ref={bar} />
    </div>
  );
}

/**
 * Load more / infinite scroll for an archive.
 *
 * The numbered pagination stays in the server HTML for crawlers and for
 * visitors without JavaScript; this hides it once it is running. The next
 * page is fetched as ordinary HTML, its cards appended to the grid, and the
 * address bar follows so a reload or a shared link lands where the reader is.
 */
export function LoadMore({ nextHref, mode, label }: { nextHref: string; mode: "loadmore" | "infinite"; label: string }) {
  const [next, setNext] = useState<string | null>(nextHref);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const loading = useRef(false);

  useEffect(() => {
    const nav = document.querySelector<HTMLElement>("nav[data-pagination]");
    if (nav) nav.style.display = "none";
    return () => {
      if (nav) nav.style.display = "";
    };
  }, []);

  const load = async () => {
    if (!next || loading.current) return;
    loading.current = true;
    setBusy(true);
    try {
      const res = await fetch(next, { headers: { accept: "text/html" } });
      if (!res.ok) throw new Error(String(res.status));
      const doc = new DOMParser().parseFromString(await res.text(), "text/html");
      const grid = document.querySelector(".archive-items");
      doc.querySelectorAll(".archive-items > *").forEach((el) => grid?.appendChild(document.importNode(el, true)));
      try {
        window.history.replaceState(window.history.state, "", next);
      } catch {
        // Some embedded browsers refuse; the cards are still there.
      }
      setNext(doc.querySelector("nav[data-pagination] a[rel=next]")?.getAttribute("href") ?? null);
    } catch {
      // Show the numbers again so the reader is never stranded.
      setFailed(true);
      const nav = document.querySelector<HTMLElement>("nav[data-pagination]");
      if (nav) nav.style.display = "";
    } finally {
      loading.current = false;
      setBusy(false);
    }
  };

  useEffect(() => {
    if (mode !== "infinite" || !next || failed || !box.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting) void load();
    }, { rootMargin: "600px" });
    io.observe(box.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, next, failed]);

  if (!next || failed) return null;
  return (
    <div ref={box} className="bms-loadmore">
      {/* The label stays put while it loads: swapping it for an ellipsis left
          a screen reader reading the button as "…", with nothing to say what
          it does. `aria-busy` is the part that carries "working on it". */}
      <button type="button" onClick={load} disabled={busy} aria-busy={busy || undefined}>
        {label}
      </button>
    </div>
  );
}
