"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import BlockStyle from "@/components/shared/BlockStyle";
import ContentImage from "@/components/frontend/ContentImage";

// A carousel without a carousel library.
//
// The track is a native horizontal scroller with CSS scroll-snap, so swiping
// on a phone is the browser's own gesture — smooth, momentum and all — and the
// slides are real content in the HTML from the first byte (no layout shift,
// crawlable). JavaScript adds only what CSS cannot: arrows, dots, autoplay and
// the loop back to the start. A slider with every option off ships as markup.

export interface Slide {
  image?: string;
  alt?: string;
  title?: string;
  text?: string;
  buttonLabel?: string;
  buttonUrl?: string;
}

export interface SliderOptions {
  perView: { desktop: number; tablet: number; mobile: number };
  gap: number;
  autoplay: boolean;
  interval: number;
  pauseOnHover: boolean;
  loop: boolean;
  arrows: boolean;
  dots: boolean;
  captions: boolean;
  /** CSS aspect ratio of each slide image, e.g. "16/9"; "auto" keeps the image's own. */
  ratio: string;
  overlay: boolean;
  radius: number;
}

export default function SliderFE({ slides, options, id, labels }: {
  slides: Slide[];
  options: SliderOptions;
  id: string;
  /** The controls' accessible names. `carousel` and `slide` are
   *  aria-roledescription, which the spec says must be in the page's
   *  language — an Arabic page announcing "carousel" is a defect, not a quirk. */
  labels: { carousel: string; slide: string; prev: string; next: string; slideOf: string[]; pause: string; play: string };
}) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [pages, setPages] = useState(slides.length);
  const [paused, setPaused] = useState(false);
  // The visitor's own stop, from the Pause button. Hover and focus pause only
  // while they last; WCAG 2.2.2 asks that moving content can be stopped.
  const [stopped, setStopped] = useState(false);

  // How many snap positions there are depends on how many slides fit, which
  // depends on the viewport — measured rather than assumed.
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    if (!first) return;
    const step = first.offsetWidth + options.gap;
    const visible = Math.max(1, Math.round((el.clientWidth + options.gap) / step));
    setPages(Math.max(1, slides.length - visible + 1));
    setIndex(Math.min(Math.round(el.scrollLeft / step), slides.length - 1));
  }, [options.gap, slides.length]);

  useEffect(() => {
    measure();
    const el = track.current;
    if (!el) return;
    const onScroll = () => requestAnimationFrame(measure);
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", measure);
    };
  }, [measure]);

  const go = useCallback(
    (i: number) => {
      const el = track.current;
      if (!el) return;
      const first = el.children[0] as HTMLElement | undefined;
      if (!first) return;
      let target = i;
      if (target >= pages) target = options.loop ? 0 : pages - 1;
      if (target < 0) target = options.loop ? pages - 1 : 0;
      el.scrollTo({ left: target * (first.offsetWidth + options.gap), behavior: "smooth" });
    },
    [pages, options.loop, options.gap]
  );

  useEffect(() => {
    if (!options.autoplay || paused || stopped || pages <= 1) return;
    // Respect a visitor who has asked the system for less motion.
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
    const t = setInterval(() => {
      if (document.hidden) return;
      if (!options.loop && index >= pages - 1) return;
      go(index + 1);
    }, Math.max(1500, options.interval));
    return () => clearInterval(t);
  }, [options.autoplay, options.interval, options.loop, paused, stopped, pages, index, go]);

  const cls = `bms-slider-${id.replace(/[^a-zA-Z0-9]/g, "")}`;
  // One slide's share of the width at each breakpoint of the CSS below.
  const slideSizes = `(max-width: 639px) ${Math.round(100 / options.perView.mobile)}vw, (max-width: 1023px) ${Math.round(100 / options.perView.tablet)}vw, ${Math.round(100 / options.perView.desktop)}vw`;
  const css = `
.${cls} .bms-slide{flex:0 0 calc((100% - ${options.gap * (options.perView.mobile - 1)}px) / ${options.perView.mobile})}
@media(min-width:640px){.${cls} .bms-slide{flex-basis:calc((100% - ${options.gap * (options.perView.tablet - 1)}px) / ${options.perView.tablet})}}
@media(min-width:1024px){.${cls} .bms-slide{flex-basis:calc((100% - ${options.gap * (options.perView.desktop - 1)}px) / ${options.perView.desktop})}}`;

  return (
    <div
      className={`bms-slider ${cls} relative my-6`}
      role="region"
      aria-roledescription={labels.carousel}
      onMouseEnter={() => options.pauseOnHover && setPaused(true)}
      onMouseLeave={() => options.pauseOnHover && setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <BlockStyle css={css} />
      <div
        ref={track}
        className="bms-slider-track flex overflow-x-auto snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        style={{ gap: `${options.gap}px` }}
      >
        {slides.map((s, i) => (
          <div
            key={i}
            className="bms-slide relative snap-start overflow-hidden"
            style={{ borderRadius: `${options.radius}px` }}
            role="group"
            aria-roledescription={labels.slide}
            aria-label={labels.slideOf[i] ?? `${i + 1} / ${slides.length}`}
          >
            {s.image && (
              // Optimised, at the width one slide takes at each breakpoint —
              // the first slide loads at once, and it was the full original.
              <ContentImage
                src={s.image}
                alt={s.alt || s.title || ""}
                lazy={i !== 0}
                sizes={slideSizes}
                className="block w-full object-cover"
                style={options.ratio !== "auto" ? { aspectRatio: options.ratio } : undefined}
              />
            )}
            {options.captions && (s.title || s.text || s.buttonLabel) && (
              <div
                className={
                  s.image && options.overlay
                    ? "absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-5 text-white"
                    : "p-4"
                }
              >
                {s.title && <p className="text-lg font-bold leading-snug">{s.title}</p>}
                {s.text && <p className="mt-1 text-sm opacity-90">{s.text}</p>}
                {s.buttonLabel && s.buttonUrl && (
                  <a href={s.buttonUrl} className="btn mt-3 inline-block">
                    {s.buttonLabel}
                  </a>
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {options.arrows && pages > 1 && (
        <>
          <button
            type="button"
            aria-label={labels.prev}
            onClick={() => go(index - 1)}
            disabled={!options.loop && index === 0}
            className="absolute left-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white disabled:opacity-0"
          >
            ‹
          </button>
          <button
            type="button"
            aria-label={labels.next}
            onClick={() => go(index + 1)}
            disabled={!options.loop && index >= pages - 1}
            className="absolute right-2 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-800 shadow-md transition hover:bg-white disabled:opacity-0"
          >
            ›
          </button>
        </>
      )}

      {(options.dots || options.autoplay) && pages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2">
          {options.autoplay && (
            <button
              type="button"
              onClick={() => setStopped((s) => !s)}
              aria-label={stopped ? labels.play : labels.pause}
              title={stopped ? labels.play : labels.pause}
              className="me-2 flex h-6 w-6 items-center justify-center rounded-full text-xs opacity-60 transition hover:opacity-100"
            >
              <span aria-hidden="true">{stopped ? "▶" : "❚❚"}</span>
            </button>
          )}
          {options.dots && Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              // In the page's language, like the slides' own names.
              aria-label={labels.slideOf[i] ?? `${i + 1} / ${pages}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className="h-2 rounded-full transition-all"
              style={{ width: i === index ? 20 : 8, background: i === index ? "var(--color-primary,#0ea5e9)" : "rgba(0,0,0,.2)" }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
