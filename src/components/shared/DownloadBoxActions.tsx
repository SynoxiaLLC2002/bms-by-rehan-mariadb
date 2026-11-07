"use client";

import { useEffect, useRef, useState } from "react";
import type { ResolvedDlb } from "@/lib/downloadBox";
import { linkRel, newTabProps } from "@/lib/linkRel";

// The download button(s), with the optional countdown.
//
//   click   the button starts a countdown, then the download begins
//   reveal  a countdown runs when the box scrolls into view, then the
//           button appears
//
// A click countdown navigates in the same tab when it finishes: a tab opened
// by a timer rather than by the click itself is blocked as a popup.

function Icon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

export default function DownloadBoxActions({ box, inert = false }: { box: ResolvedDlb; inert?: boolean }) {
  const { button, button2, countdown } = box;
  const mode = inert ? "off" : countdown.mode;
  const [left, setLeft] = useState<number | null>(null);
  const [revealed, setRevealed] = useState(mode !== "reveal");
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const tick = (onDone: () => void) => {
    started.current = true;
    setLeft(countdown.seconds);
    const t0 = Date.now();
    const iv = window.setInterval(() => {
      const remaining = countdown.seconds - Math.floor((Date.now() - t0) / 1000);
      if (remaining <= 0) {
        window.clearInterval(iv);
        setLeft(null);
        onDone();
      } else {
        setLeft(remaining);
      }
    }, 250);
  };

  useEffect(() => {
    if (mode !== "reveal" || !root.current) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !started.current) {
        io.disconnect();
        tick(() => setRevealed(true));
      }
    }, { threshold: 0.3 });
    io.observe(root.current);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const rel = linkRel({ newTab: button.newTab, nofollow: button.nofollow });
  const href = inert ? undefined : button.url || undefined;

  const counter =
    left !== null ? (
      <div className="dlb-count" role="status" aria-live="polite">
        <span className="dlb-count-ring" style={{ ["--dlb-p" as string]: `${((countdown.seconds - left) / countdown.seconds) * 100}%` }} />
        <span>
          {countdown.text.split("{s}").map((part, i, arr) => (
            <span key={i}>
              {part}
              {i < arr.length - 1 && <span className="dlb-count-num">{left}</span>}
            </span>
          ))}
        </span>
      </div>
    ) : null;

  return (
    <div ref={root} style={{ display: "contents" }}>
      {counter}
      {revealed && left === null && (
        <a
          className="dlb-btn"
          href={href}
          target={button.newTab && mode !== "click" ? "_blank" : undefined}
          rel={rel}
          download={button.download && !inert ? "" : undefined}
          aria-disabled={!button.url || inert ? true : undefined}
          onClick={(e) => {
            if (inert) {
              e.preventDefault();
              return;
            }
            if (mode === "click" && button.url) {
              e.preventDefault();
              if (!started.current) tick(() => window.location.assign(button.url));
            }
          }}
        >
          {button.icon && <Icon />}
          {button.sub ? (
            <span className="dlb-btn-text">
              <span>{button.label}</span>
              <span className="dlb-btn-sub">{button.sub}</span>
            </span>
          ) : (
            <span>{button.label}</span>
          )}
        </a>
      )}
      {button2 && (
        <a className="dlb-btn2" href={inert ? undefined : button2.url} {...newTabProps(true, { nofollow: true })}>
          {button2.label}
        </a>
      )}
    </div>
  );
}
