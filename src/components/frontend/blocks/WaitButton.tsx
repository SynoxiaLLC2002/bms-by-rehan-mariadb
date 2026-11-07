"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// A button that makes the visitor wait before it does its job.
//
// Click → a ring fills while "Please wait 5 seconds" counts down inside the
// button → then either the link opens by itself ("go"), or the button unlocks
// and the next click opens it ("unlock"). "Unlock" is the one to use for links
// that open in a new tab: a tab opened by a timer instead of a click is
// blocked as a popup. "Go" with a new-tab link tries it anyway and, when the
// browser refuses, leaves the button unlocked for the visitor's own click.
//
// Either way, once the wait is over the button is an ordinary link for good.
// It used to ignore every later click in "go" mode, so a download that was
// cancelled or failed — the page stays open while an APK downloads — could
// not be started again without reloading.

export interface WaitOptions {
  seconds: number;
  /** "{s}" becomes the seconds left. */
  text: string;
  after: "go" | "unlock";
  /** Label once unlocked; the button's own content when empty. */
  readyText: string;
}

export default function WaitButton({
  href,
  target,
  rel,
  download,
  className,
  ariaLabel,
  id,
  wait,
  children,
}: {
  href: string;
  target?: string;
  rel?: string;
  download?: boolean;
  className: string;
  ariaLabel?: string;
  id?: string;
  wait: WaitOptions;
  children: ReactNode;
}) {
  const [phase, setPhase] = useState<"idle" | "wait" | "ready">("idle");
  const [left, setLeft] = useState(wait.seconds);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    if (timer.current) window.clearInterval(timer.current);
  }, []);

  /** Follows the link the way a click on it would: download, new tab or here. */
  const go = () => {
    if (download) {
      // A click on a `download` link saves the file and leaves the page
      // where it is; assigning the location would not.
      const a = document.createElement("a");
      a.href = href;
      a.download = "";
      if (rel) a.rel = rel;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return;
    }
    if (target === "_blank") {
      // Usually blocked (no click behind it); then the unlocked button is
      // the visitor's way in.
      window.open(href, "_blank", rel?.includes("noopener") ? "noopener" : undefined);
      return;
    }
    window.location.assign(href);
  };

  const start = () => {
    setPhase("wait");
    setLeft(wait.seconds);
    const t0 = Date.now();
    timer.current = window.setInterval(() => {
      const remaining = wait.seconds - (Date.now() - t0) / 1000;
      if (remaining <= 0) {
        if (timer.current) window.clearInterval(timer.current);
        timer.current = null;
        setPhase("ready");
        if (wait.after === "go" && href) go();
      } else {
        setLeft(remaining);
      }
    }, 100);
  };

  const whole = Math.ceil(left);
  const progress = phase === "wait" ? 1 - left / wait.seconds : phase === "ready" ? 1 : 0;
  const r = 9;
  const c = 2 * Math.PI * r;

  const waiting = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: ".55em" }} aria-live="polite">
      <svg width="1.35em" height="1.35em" viewBox="0 0 22 22" aria-hidden="true" style={{ flex: "none", transform: "rotate(-90deg)" }}>
        <circle cx="11" cy="11" r={r} fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2.5" />
        <circle cx="11" cy="11" r={r} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - progress)} style={{ transition: "stroke-dashoffset .1s linear" }} />
      </svg>
      <span>
        {wait.text.split("{s}").map((part, i, arr) => (
          <span key={i}>
            {part}
            {i < arr.length - 1 && <b style={{ fontVariantNumeric: "tabular-nums" }}>{whole}</b>}
          </span>
        ))}
      </span>
    </span>
  );

  return (
    <a
      id={id}
      href={href || undefined}
      target={phase === "ready" ? target : undefined}
      rel={rel}
      download={phase === "ready" && download ? "" : undefined}
      className={className}
      aria-label={phase === "idle" ? ariaLabel : undefined}
      aria-busy={phase === "wait" || undefined}
      style={phase === "wait" ? { cursor: "progress" } : undefined}
      onClick={(e) => {
        if (phase === "ready") return; // an ordinary link from now on
        e.preventDefault();
        if (phase === "idle") start();
      }}
    >
      {phase === "wait" ? waiting : phase === "ready" && wait.readyText ? <span className="bmsbtn-label">{wait.readyText}</span> : children}
    </a>
  );
}
