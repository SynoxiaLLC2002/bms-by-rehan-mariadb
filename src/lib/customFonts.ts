// Uploaded fonts — the pure half, shared by the server stylesheet and the
// customizer preview. Files live under `fonts/custom/` (see lib/localFonts.ts)
// and are served by `/fonts/…`; this module only knows the list stored in the
// `custom_fonts` setting and how to turn it into @font-face rules.

export interface CustomFont {
  family: string;
  /** "400", "700", or a range like "100 900" for a variable font. */
  weight: string;
  style: "normal" | "italic";
  /** Served path, e.g. /fonts/custom/my-font-400.woff2 */
  file: string;
}

export function parseCustomFonts(raw: string | undefined | null): CustomFont[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    return v
      .filter((f) => f && typeof f.family === "string" && typeof f.file === "string" && f.family.trim() && f.file.startsWith("/fonts/"))
      .map((f) => ({
        family: String(f.family).trim().slice(0, 80),
        weight: /^\d{3}(\s\d{3})?$/.test(String(f.weight ?? "")) ? String(f.weight) : "400",
        style: f.style === "italic" ? "italic" : "normal",
        file: String(f.file),
      }));
  } catch {
    return [];
  }
}

/** Distinct family names, for the font pickers. */
export function customFontFamilies(fonts: CustomFont[]): string[] {
  return [...new Set(fonts.map((f) => f.family))];
}

function formatOf(file: string): string {
  const ext = file.split(".").pop()?.toLowerCase();
  return ext === "woff2" ? "woff2" : ext === "woff" ? "woff" : ext === "otf" ? "opentype" : "truetype";
}

/** @font-face rules for every uploaded face. `font-display: swap` — text first. */
export function customFontFaceCss(fonts: CustomFont[]): string {
  return fonts
    .map(
      (f) =>
        `@font-face{font-family:"${f.family.replace(/"/g, "")}";font-style:${f.style};font-weight:${f.weight};font-display:swap;src:url("${f.file}") format("${formatOf(f.file)}")}`
    )
    .join("\n");
}
