"use client";

import { useRef, useState } from "react";
import { Loader2, Trash2, Upload } from "lucide-react";
import { parseCustomFonts } from "@/lib/customFonts";

/**
 * Upload your own font files (Customizer → Colors & Fonts). Each upload is one
 * face — a family name, a weight and a style — and the family then appears in
 * the Heading and Body font pickers. The list is kept in the `custom_fonts`
 * setting by /api/fonts; `onChange` hands the new list back so the
 * customizer's own state (which saves every setting) never writes a stale one.
 */
export default function CustomFontsManager({ value, onChange }: { value: string; onChange: (json: string) => void }) {
  const fonts = parseCustomFonts(value);
  const fileRef = useRef<HTMLInputElement>(null);
  const [family, setFamily] = useState("");
  const [weight, setWeight] = useState("400");
  const [style, setStyle] = useState("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("family", family.trim() || file.name.replace(/\.[^.]+$/, "").replace(/[-_](regular|bold|italic|\d{3}).*$/i, "").replace(/[-_]+/g, " "));
      fd.append("weight", weight);
      fd.append("style", style);
      const res = await fetch("/api/fonts", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) setError(data.error ?? "Upload failed.");
      else onChange(JSON.stringify(data.fonts));
    } catch {
      setError("Upload failed.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove(file: string) {
    if (!confirm("Remove this font file? Text using it falls back to the next font in the stack.")) return;
    const res = await fetch(`/api/fonts?file=${encodeURIComponent(file)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (res.ok) onChange(JSON.stringify(data.fonts));
  }

  return (
    <div className="mb-4 rounded-lg border border-slate-200 p-3">
      <p className="mb-1 text-xs font-semibold text-slate-700">Your fonts</p>
      <p className="mb-3 text-[11px] leading-relaxed text-slate-400">
        Upload a font file (.woff2 is best) and pick it above as Heading or Body font. Upload each weight you use — e.g. 400 and 700 —
        as its own file with the same family name.
      </p>
      {fonts.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100 rounded border border-slate-100">
          {fonts.map((f) => (
            <li key={f.file} className="flex items-center gap-2 px-2 py-1.5 text-xs">
              <span className="min-w-0 flex-1 truncate" style={{ fontFamily: `"${f.family}"`, fontWeight: Number(f.weight.split(" ")[0]), fontStyle: f.style }}>
                {f.family}
              </span>
              <span className="text-[10px] text-slate-400">{f.weight}{f.style === "italic" ? " italic" : ""}</span>
              <button type="button" onClick={() => remove(f.file)} className="text-slate-400 hover:text-red-600" title="Remove">
                <Trash2 size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-2">
        <input className="input col-span-3 text-xs" value={family} onChange={(e) => setFamily(e.target.value)} placeholder="Family name, e.g. Tajawal" />
        <select className="input text-xs" value={weight} onChange={(e) => setWeight(e.target.value)}>
          {["100", "200", "300", "400", "500", "600", "700", "800", "900"].map((w) => <option key={w} value={w}>{w}</option>)}
          <option value="100 900">Variable</option>
        </select>
        <select className="input text-xs" value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="normal">Normal</option>
          <option value="italic">Italic</option>
        </select>
        <label className={`btn-primary flex cursor-pointer items-center justify-center gap-1.5 text-xs ${busy ? "opacity-60" : ""}`}>
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          {busy ? "…" : "Upload"}
          <input ref={fileRef} type="file" accept=".woff2,.woff,.ttf,.otf" className="hidden" disabled={busy}
            onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </label>
      </div>
      {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
