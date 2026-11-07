"use client";

// The last resort: an error thrown by the root layout itself.
//
// `error.tsx` sits *inside* the root layout, so it cannot catch a failure in
// that layout — and the root layout here calls `generateMetadata`, which reads
// site settings from the database. When that is the thing that broke, this is
// the only file that runs, which is why it has to supply its own `<html>` and
// `<body>` and style itself inline: no stylesheet is guaranteed to have loaded.

import { useEffect, useState } from "react";
import { errorText } from "@/lib/notFoundText";

const RTL = new Set(["ar", "fa", "ur", "he", "ps"]);

/**
 * The visitor's language. The layout that knew it is the thing that failed,
 * so: the URL's language prefix when it has one, else the browser's.
 */
function guessLanguage(): string {
  const first = window.location.pathname.split("/")[1] ?? "";
  if (/^[a-z]{2,3}(-[a-z0-9]+)?$/i.test(first) && errorText(first) !== errorText("zz")) return first;
  return navigator.language || "en";
}

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[root error]", error.digest ?? "", error);
  }, [error]);

  // English for the first frame, then the visitor's language.
  const [lang, setLang] = useState("en");
  useEffect(() => setLang(guessLanguage()), []);
  const t = errorText(lang);
  const base = lang.split("-")[0].toLowerCase();

  return (
    <html lang={lang} dir={RTL.has(base) ? "rtl" : "ltr"}>
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif",
          color: "#0f172a",
          background: "#f8fafc",
        }}
      >
        <div style={{ maxWidth: 480, padding: 24, textAlign: "center" }}>
          <p style={{ fontSize: 64, fontWeight: 700, opacity: 0.12, margin: "0 0 8px" }}>500</p>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: "0 0 12px" }}>{t.title}</h1>
          <p style={{ opacity: 0.6, lineHeight: 1.6, margin: "0 0 28px" }}>{t.body}</p>
          <button
            type="button"
            onClick={reset}
            style={{
              padding: "10px 20px",
              borderRadius: 8,
              border: 0,
              background: "#0f172a",
              color: "#fff",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            {t.retry}
          </button>
          {error.digest && (
            <p style={{ marginTop: 32, fontFamily: "monospace", fontSize: 11, opacity: 0.35 }}>
              Reference: {error.digest}
            </p>
          )}
        </div>
      </body>
    </html>
  );
}
