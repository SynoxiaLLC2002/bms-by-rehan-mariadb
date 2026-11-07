"use client";

import { useEffect } from "react";
import { previewCss, TEXT_KEYS } from "@/lib/siteCss";
import { HEADER_ROWS, FOOTER_ROWS, COLS, slotId } from "@/lib/builderItems";

// The id SiteLayout gives its stylesheet. React renders that <style> into the
// BODY, so a style appended to <head> would always lose on document order —
// the bridge therefore rewrites this exact element rather than adding its own.
const SITE_STYLE_ID = "bms-site-style";

/**
 * Runs only inside the Customizer's preview iframe. Listens for setting changes
 * from the parent window and applies them immediately — no save, no reload.
 * On a normal page load (not framed) this does nothing at all.
 */
export default function PreviewBridge() {
  useEffect(() => {
    // Not in an iframe → not a preview. Bail before touching anything.
    if (typeof window === "undefined" || window.parent === window) return;

    function apply(settings: Record<string, string>) {
      let el = document.getElementById(SITE_STYLE_ID) as HTMLStyleElement | null;
      if (!el) {
        // Fallback only: append to the end of <body> so it still wins on order.
        el = document.createElement("style");
        el.id = SITE_STYLE_ID;
        document.body.appendChild(el);
      }
      el.textContent = previewCss(settings);

      for (const key of TEXT_KEYS) {
        const value = settings[key];
        if (value === undefined) continue;
        document.querySelectorAll(`[data-bms-text="${key}"]`).forEach((node) => {
          node.textContent = value;
        });
      }

      const btnUrl = settings.header_button_url;
      if (btnUrl) {
        document.querySelectorAll<HTMLAnchorElement>('[data-bms-href="header_button_url"]').forEach((a) => {
          a.href = btnUrl;
        });
      }

      const logoHeight = parseInt(settings.logo_height);
      document.querySelectorAll<HTMLImageElement>("[data-bms-logo]").forEach((img) => {
        if (logoHeight) img.style.height = `${logoHeight}px`;
        if (settings.site_logo && img.getAttribute("src") !== settings.site_logo) {
          // The resized candidates belong to the old file; without this the
          // browser keeps showing them and the new logo never appears.
          img.removeAttribute("srcset");
          img.src = settings.site_logo;
        }
      });

      applyZones(settings);
      applyWidgetContent(settings);
    }

    const readZone = (raw: string | undefined): string[] => {
      try {
        const a = JSON.parse(raw || "[]");
        return Array.isArray(a) ? a : [];
      } catch {
        return [];
      }
    };

    /** Show/hide/reorder the pre-rendered slots so layout edits need no reload. */
    function applyZones(settings: Record<string, string>) {
      const show = new Map<string, number>();

      for (const dev of ["desktop", "mobile"] as const) {
        const p = dev === "mobile" ? "header_m_" : "header_";
        for (const row of HEADER_ROWS) {
          for (const col of COLS) {
            readZone(settings[`${p}${row}_${col}`]).forEach((item, idx) => {
              show.set(slotId(`hdr:${dev}`, row, col, item), idx);
            });
          }
          if (row !== "main") {
            const on = settings[`${p}${row}_enabled`] === "true";
            const el = document.querySelector<HTMLElement>(`[data-bms-row="hdr:${dev}:${row}"]`);
            if (el) el.style.display = on ? "" : "none";
          }
        }
      }

      for (const row of FOOTER_ROWS) {
        for (const col of COLS) {
          readZone(settings[`footer_${row}_${col}`]).forEach((item, idx) => {
            show.set(slotId("ftr", row, col, item), idx);
          });
        }
        if (row !== "main") {
          const on = settings[`footer_${row}_enabled`] === "true";
          const el = document.querySelector<HTMLElement>(`[data-bms-row="ftr:${row}"]`);
          if (el) el.style.display = on ? "" : "none";
        }
      }

      document.querySelectorAll<HTMLElement>("[data-bms-slot]").forEach((el) => {
        const key = el.dataset.bmsSlot!;
        const order = show.get(key);
        if (order === undefined) {
          el.style.display = "none";
        } else {
          el.style.display = "";
          el.style.order = String(order);
        }
      });
    }

    /** Footer widget titles, body text and link lists, rebuilt in place. */
    function applyWidgetContent(settings: Record<string, string>) {
      let widgets: Record<string, { title?: string; text?: string; links?: { label: string; url: string }[] }> = {};
      try { widgets = JSON.parse(settings.footer_widgets || "{}") || {}; } catch { widgets = {}; }

      for (const [id, w] of Object.entries(widgets)) {
        document.querySelectorAll<HTMLElement>(`[data-bms-widget-title="${id}"]`).forEach((el) => {
          el.textContent = w.title ?? "";
          el.style.display = w.title ? "" : "none";
        });
        document.querySelectorAll<HTMLElement>(`[data-bms-widget-text="${id}"]`).forEach((el) => {
          el.textContent = w.text ?? "";
        });
        document.querySelectorAll<HTMLElement>(`[data-bms-widget-links="${id}"]`).forEach((el) => {
          fillLinks(el, w.links ?? []);
        });
      }

      let bottom: { label: string; url: string }[] = [];
      try { bottom = JSON.parse(settings.footer_bottom_links || "[]") || []; } catch { bottom = []; }
      document.querySelectorAll<HTMLElement>("[data-bms-bottom-links]").forEach((el) => {
        fillLinks(el, bottom, true);
      });
    }

    /** Rebuild a link list from data. textContent only — never innerHTML. */
    function fillLinks(host: HTMLElement, links: { label: string; url: string }[], inline = false) {
      host.textContent = "";
      links.filter((l) => l.label).forEach((l) => {
        const a = document.createElement("a");
        a.href = l.url || "#";
        a.textContent = l.label;
        a.className = inline
          ? "uppercase tracking-wide hover:opacity-100 opacity-70 transition-opacity"
          : "hover:opacity-100 opacity-80 transition-opacity";
        if (inline) {
          host.appendChild(a);
        } else {
          const li = document.createElement("li");
          li.appendChild(a);
          host.appendChild(li);
        }
      });
    }

    function onMessage(e: MessageEvent) {
      // Same-origin only; the customizer and the site are served together.
      if (e.origin !== window.location.origin) return;
      const data = e.data;
      if (!data || data.__bms !== "preview" || typeof data.settings !== "object") return;
      apply(data.settings as Record<string, string>);
    }

    window.addEventListener("message", onMessage);
    // Tell the customizer we're mounted so it can push the current draft.
    window.parent.postMessage({ __bms: "ready" }, window.location.origin);

    return () => window.removeEventListener("message", onMessage);
  }, []);

  return null;
}
