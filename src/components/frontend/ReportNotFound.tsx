"use client";

import { useEffect } from "react";

/**
 * Reports the missing URL so it shows up in the 404 log, where it can be turned
 * into a redirect. Fires once, ignores failures, and never blocks the page.
 */
export default function ReportNotFound() {
  useEffect(() => {
    const path = window.location.pathname;
    if (!path || path === "/") return;

    // Don't log the same path repeatedly within one browsing session.
    const key = `bms-404:${path}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch {
      /* private mode — just log it */
    }

    void fetch("/api/not-found-log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, referrer: document.referrer || null }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  return null;
}
