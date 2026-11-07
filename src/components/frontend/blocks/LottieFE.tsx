"use client";

import { useEffect, useRef } from "react";

// A Lottie animation. The player (lottie-web's light build, ~60 KB gzipped) is
// imported only when this component mounts, and — unless the animation is set
// to play immediately above the fold — only once the block scrolls near the
// viewport, so a page with an animation at the bottom pays nothing up front.

export interface LottieProps {
  src: string;
  trigger: "autoplay" | "hover" | "click" | "scroll" | "inview";
  loop: boolean;
  speed: number;
  width: number;
  align: string;
  label: string;
}

export default function LottieFE(p: LottieProps) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = box.current;
    if (!el || !p.src) return;
    let anim: { play(): void; pause(): void; stop(): void; destroy(): void; setSpeed(n: number): void; goToAndStop(v: number, isFrame?: boolean): void; totalFrames: number } | null = null;
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const start = async () => {
      const lottie = (await import("lottie-web/build/player/lottie_light")).default;
      if (cancelled) return;
      const autoplay = p.trigger === "autoplay" && !reduced;
      anim = lottie.loadAnimation({ container: el, renderer: "svg", loop: p.loop, autoplay, path: p.src }) as unknown as typeof anim;
      if (!anim) return;
      anim.setSpeed(p.speed > 0 ? p.speed : 1);
      const a = anim;

      if (p.trigger === "hover") {
        const on = () => a.play();
        const off = () => a.pause();
        el.addEventListener("mouseenter", on);
        el.addEventListener("mouseleave", off);
        cleanups.push(() => { el.removeEventListener("mouseenter", on); el.removeEventListener("mouseleave", off); });
      } else if (p.trigger === "click") {
        let playing = false;
        const toggle = () => { if (playing) a.pause(); else a.play(); playing = !playing; };
        el.addEventListener("click", toggle);
        cleanups.push(() => el.removeEventListener("click", toggle));
      } else if (p.trigger === "inview") {
        const io = new IntersectionObserver(([e]) => (e.isIntersecting && !reduced ? a.play() : a.pause()), { threshold: 0.25 });
        io.observe(el);
        cleanups.push(() => io.disconnect());
      } else if (p.trigger === "scroll") {
        // Scrubbed by scroll position: frame follows how far the block has crossed the viewport.
        const onScroll = () => {
          const r = el.getBoundingClientRect();
          const progress = Math.min(1, Math.max(0, (window.innerHeight - r.top) / (window.innerHeight + r.height)));
          a.goToAndStop(Math.floor(progress * (a.totalFrames - 1)), true);
        };
        window.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
        cleanups.push(() => window.removeEventListener("scroll", onScroll));
      }
    };

    if (p.trigger === "autoplay") {
      void start();
    } else {
      const io = new IntersectionObserver(([e]) => {
        if (e.isIntersecting) {
          io.disconnect();
          void start();
        }
      }, { rootMargin: "300px" });
      io.observe(el);
      cleanups.push(() => io.disconnect());
    }

    return () => {
      cancelled = true;
      cleanups.forEach((c) => c());
      anim?.destroy();
    };
  }, [p.src, p.trigger, p.loop, p.speed]);

  const side = p.align === "center" ? { marginLeft: "auto", marginRight: "auto" } : p.align === "right" ? { marginLeft: "auto" } : {};
  return (
    <div
      ref={box}
      className={`bms-lottie my-6 ${p.trigger === "click" ? "cursor-pointer" : ""}`}
      style={{ maxWidth: p.width > 0 ? `${p.width}px` : undefined, ...side }}
      role="img"
      aria-label={p.label || "Animation"}
    />
  );
}
