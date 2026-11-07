"use client";

// Free-typing tag field with suggestions.
//
// Tags are stored by name and matched on slug when the post saves, so this only
// has to produce a clean list of strings — no ids, and no "create tag first"
// round trip before a post can be saved.

import { useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";

export default function TagInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const [all, setAll] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((d) => setAll((d.tags ?? []).map((t: { name: string }) => t.name)))
      .catch(() => setAll([]));
  }, []);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    const taken = new Set(value.map((v) => v.toLowerCase()));
    return all
      .filter((t) => !taken.has(t.toLowerCase()) && (!q || t.toLowerCase().includes(q)))
      .slice(0, 8);
  }, [all, query, value]);

  const add = (name: string) => {
    const clean = name.trim();
    if (!clean) return;
    if (value.some((v) => v.toLowerCase() === clean.toLowerCase())) { setQuery(""); return; }
    onChange([...value, clean]);
    setQuery("");
  };

  return (
    <div ref={boxRef} className="relative">
      <div className="input flex flex-wrap items-center gap-1.5 !py-1.5">
        {value.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-700">
            {t}
            <button
              type="button"
              onClick={() => onChange(value.filter((v) => v !== t))}
              className="text-slate-400 hover:text-red-600"
            >
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          className="min-w-[7rem] flex-1 bg-transparent text-sm focus:outline-none"
          value={query}
          placeholder={value.length ? "" : "Add a tag…"}
          onFocus={() => setOpen(true)}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") { e.preventDefault(); add(query); }
            // Backspace on an empty box removes the last chip, as chip inputs do.
            else if (e.key === "Backspace" && !query && value.length) onChange(value.slice(0, -1));
          }}
        />
      </div>

      {open && suggestions.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
          {suggestions.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => add(t)}
              className="block w-full px-3 py-1.5 text-left text-xs text-slate-700 hover:bg-slate-50"
            >
              {t}
            </button>
          ))}
        </div>
      )}
      <p className="mt-1 text-[11px] text-slate-400">Enter or comma to add. New names create the tag on save.</p>
    </div>
  );
}
