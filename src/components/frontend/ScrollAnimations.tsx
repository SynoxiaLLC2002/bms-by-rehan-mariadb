"use client";

// Drives the `bx-an` scroll animations for a whole page from one observer.
//
// The arming class is added here rather than shipped in the HTML on purpose: it
// is what sets `opacity: 0`, so if this component never runs — JS disabled, a
// crawler, a hydration failure — every animated block simply stays visible
// instead of being invisible forever. That is the one failure mode a scroll
// animation must not have.

import { useEffect } from "react";

const READY = "bx-an-ready";
const IN = "bx-in";

export default function ScrollAnimations() {
  useEffect(() => {
    // Someone who asked for less motion gets no animation at all — not a
    // faster one. Nothing is armed, so nothing ever hides.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    if (typeof IntersectionObserver === "undefined") return;

    const nodes = Array.from(document.querySelectorAll<HTMLElement>(".bx-an"));
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement;
          if (entry.isIntersecting) {
            el.classList.add(IN);
            // A one-shot animation stops costing anything once it has played.
            if (el.dataset.bxAnReplay !== "1") observer.unobserve(el);
          } else if (el.dataset.bxAnReplay === "1") {
            el.classList.remove(IN);
          }
        }
      },
      // Threshold 0 — any part inside the band — not a share of the block.
      // It was 0.05, which is 5% of the *element*: a Row that holds a whole
      // article (25,000 px on a phone, measured) needed 1,250 px on screen at
      // once, more than any phone has, so it never came in and the article
      // stayed at opacity 0. The -10% bottom margin still delays the reveal
      // until the block is a little way up the screen.
      { rootMargin: "0px 0px -10% 0px", threshold: 0 }
    );

    // A block already on screen at load must not wait for a scroll that may
    // never come. An observer reports every element it starts watching once,
    // straight away, without anyone scrolling — so a second one with no
    // margin releases whatever is visible now and then stops. It replaced a
    // loop of getBoundingClientRect() right after the arming class went on,
    // which made the browser lay the page out on the spot (PageSpeed's
    // "forced reflow").
    const initial = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add(IN);
        if (el.dataset.bxAnReplay !== "1") observer.unobserve(el);
      }
      initial.disconnect();
    });

    for (const el of nodes) {
      el.classList.add(READY);
      observer.observe(el);
      initial.observe(el);
    }

    return () => {
      initial.disconnect();
      observer.disconnect();
      // Leaving the page mid-animation must not strand a block at opacity 0.
      for (const el of nodes) el.classList.remove(READY);
    };
  }, []);

  return null;
}
