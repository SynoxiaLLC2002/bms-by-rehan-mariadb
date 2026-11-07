"use client";

import { useEffect, useRef, useState } from "react";

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

/**
 * The Turnstile widget. Renders nothing unless a site key is configured, so
 * every form can include it unconditionally.
 *
 * Cloudflare's script finds `.cf-turnstile` elements and adds a hidden input
 * named `cf-turnstile-response` inside the enclosing <form>, which is how the
 * token reaches the submit handler without any wiring here.
 */
/**
 * Gives a form a fresh token after a failed submit.
 *
 * A token is good for one verification. Once the server has checked it —
 * even for a submission refused for some other reason — resubmitting sends
 * the spent token and is refused as "complete the verification", with no way
 * out but a reload.
 */
export function resetTurnstile(form: Element | null): void {
  const el = form?.querySelector(".cf-turnstile");
  const w = window as unknown as { turnstile?: { reset: (el: Element) => void } };
  if (el && w.turnstile) {
    try {
      w.turnstile.reset(el);
    } catch {
      // No widget rendered there (no site key): nothing to reset.
    }
  }
}

/**
 * The site key the *server* is enforcing.
 *
 * Not `process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY`: that is frozen into this
 * bundle at build time, while the server checks tokens according to the
 * host's settings now. A key added in cPanel after the build meant no widget
 * and every submission refused.
 *
 * The layout writes the key into the page (`<meta name="bms-turnstile">`, empty
 * when Turnstile is off), so normally this costs nothing. Asking
 * /api/turnstile — which Cloudflare never caches, so it reached the server on
 * every visit — is only for a page cached before the meta existed. The build
 * value is the last resort.
 */
let keyRequest: Promise<string> | null = null;
function currentSiteKey(): Promise<string> {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="bms-turnstile"]');
  if (meta) return Promise.resolve(meta.content.trim());
  keyRequest ??= fetch("/api/turnstile")
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((d: { siteKey?: string }) => d.siteKey ?? "")
    .catch(() => {
      keyRequest = null;
      return process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
    });
  return keyRequest;
}

export default function Turnstile({ className = "" }: { className?: string }) {
  const [siteKey, setSiteKey] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void currentSiteKey().then((k) => {
      if (live) setSiteKey(k);
    });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!siteKey) return;
    if (!document.querySelector(`script[src^="${SCRIPT}"]`)) {
      const s = document.createElement("script");
      s.src = SCRIPT;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    } else {
      // Script already on the page (a second form): ask it to render this one.
      const w = window as unknown as { turnstile?: { render: (el: Element, o: Record<string, string>) => void } };
      if (w.turnstile && ref.current && !ref.current.hasChildNodes()) {
        w.turnstile.render(ref.current, { sitekey: siteKey });
      }
    }
  }, [siteKey]);

  // The slot is in the server HTML from the start; the layout gives it the
  // widget's height only when Turnstile is on, so nothing below it moves
  // when the widget arrives, and a site without Turnstile gets an empty div.
  return (
    <div className={`cf-turnstile-slot ${className}`}>
      {siteKey && <div ref={ref} className="cf-turnstile" data-sitekey={siteKey} data-theme="auto" data-size="flexible" />}
    </div>
  );
}
