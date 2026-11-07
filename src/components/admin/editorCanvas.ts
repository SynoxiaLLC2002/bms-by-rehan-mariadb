import { parseInZone } from "@/lib/conditions";
// What the editor canvas has to know about the published layout.
//
// The post editor and the page editor each carried their own identical copy of
// these three. They exist so the canvas mirrors the real document — a width
// that stops matching the front end is exactly the drift these were written to
// prevent, and two copies is how that starts.

/** A date for `<input type="datetime-local">`, in the browser's own zone. */
export function toLocalInput(value: Date | string | null | undefined, timeZone?: string): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  // In the site's time zone (Settings → Timezone) when there is one. The box
  // used the browser's, so an editor travelling, or a team in two countries,
  // scheduled posts for the wrong hour while the site showed dates in its own.
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone, hour12: false, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      }).formatToParts(d);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
      return `${get("year")}-${get("month")}-${get("day")}T${get("hour") === "24" ? "00" : get("hour")}:${get("minute")}`;
    } catch {
      // Unknown zone: fall through to the browser's.
    }
  }
  const offset = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offset).toISOString().slice(0, 16);
}

/** The reverse: a datetime-local value, read in `timeZone`, as an ISO instant ("" when empty or invalid). */
export function fromLocalInput(value: string, timeZone?: string): string {
  if (!value) return "";
  const at = timeZone ? parseInZone(value, timeZone) : new Date(value).getTime();
  return Number.isNaN(at) ? "" : new Date(at).toISOString();
}

/** The canvas width for a Layout choice. */
export function editorWidthClass(layout: string): string {
  switch (layout) {
    case "normal":    return "max-w-4xl";
    case "narrow":    return "max-w-xl";
    case "wide":      return "max-w-6xl";
    case "fullwidth": return "max-w-none";
    default:          return "max-w-2xl";
  }
}

/** The canvas padding for a Vertical Spacing choice. */
export function editorSpacingClass(vs: string): string {
  switch (vs) {
    case "enable":      return "py-14";
    case "disable":     return "py-3";
    case "top-only":    return "pt-14 pb-3";
    case "bottom-only": return "pt-3 pb-14";
    default:            return "py-8";
  }
}
