import { canvasThemeCss } from "@/lib/siteCss";
import { customFontFaceCss, customFontFamilies, parseCustomFonts } from "@/lib/customFonts";

/**
 * Dresses the editor canvas in the site's theme: colours, fonts, backgrounds.
 *
 * Rendered by the editor routes next to the editor. The rules only match
 * `.bms-canvas`, which the editors put on their canvas, so the admin around it
 * keeps its own look. Fonts come straight from Google here — the inlining and
 * local copies the public site does are a speed measure for visitors, and an
 * editor screen does not need them.
 */
export default function CanvasTheme({ settings }: { settings: Record<string, string> }) {
  const custom = parseCustomFonts(settings.custom_fonts);
  const customFamilies = new Set(customFontFamilies(custom));
  const google = Array.from(
    new Set(
      [settings.font_heading, settings.font_body].filter(
        (f): f is string => !!f && f.trim() !== "" && !customFamilies.has(f)
      )
    )
  );
  const fontsUrl = google.length
    ? `https://fonts.googleapis.com/css2?${google
        .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`)
        .join("&")}&display=swap`
    : "";
  const customCss = custom.length ? customFontFaceCss(custom) : "";

  return (
    <>
      {fontsUrl && <link rel="stylesheet" href={fontsUrl} precedence="canvas-fonts" />}
      {customCss && <style dangerouslySetInnerHTML={{ __html: customCss }} />}
      <style dangerouslySetInnerHTML={{ __html: canvasThemeCss(settings) }} />
    </>
  );
}
