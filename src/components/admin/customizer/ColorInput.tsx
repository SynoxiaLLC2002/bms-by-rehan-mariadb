"use client";

// The customizer's colour control — well, hex field, and the shared palette.
//
// Header, Footer and Colors & Fonts each grew their own near-identical version
// of this. They are one component now, so the palette that was added for the
// block editor reaches all three at once instead of being pasted three times.
//
// Note this is *not* the control in ItemPanel: that one references the site's
// nine palette slots, so re-skinning updates every control pointing at a slot.
// This is the plain "pick a colour" case, where no slot is involved.

import { useState } from "react";
import { ColorSwatches } from "@/components/editor/controls";

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40";

export default function ColorInput({
  value,
  onChange,
  fallback = "#ffffff",
  round = false,
}: {
  value: string;
  onChange: (v: string) => void;
  /** Shown in the native picker when the field holds no usable hex. */
  fallback?: string;
  /** Header and Footer draw a round well; Colors & Fonts a rounded square. */
  round?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hex = /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <button
          type="button"
          title="Pick a colour"
          onClick={() => setOpen((o) => !o)}
          className={`h-9 w-9 shrink-0 border bg-white p-0.5 transition-colors ${
            round ? "rounded-full" : "rounded-lg"
          } ${open ? "border-brand-500 ring-2 ring-brand-200" : "border-slate-300"}`}
        >
          <span
            className={`block h-full w-full ${round ? "rounded-full" : "rounded-md"}`}
            style={
              value
                ? { backgroundColor: value }
                : {
                    backgroundImage:
                      "linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%),linear-gradient(45deg,#e2e8f0 25%,transparent 25%,transparent 75%,#e2e8f0 75%)",
                    backgroundSize: "8px 8px",
                    backgroundPosition: "0 0,4px 4px",
                  }
            }
          />
        </button>
        <input
          type="text"
          value={value}
          placeholder="Inherit"
          onChange={(e) => onChange(e.target.value)}
          className={`${inputCls} font-mono text-xs`}
        />
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 z-50 mt-1.5 w-60 rounded-lg border border-slate-200 bg-white p-2.5 shadow-xl">
            <ColorSwatches value={value} onChange={(c) => { onChange(c); setOpen(false); }} />
            <div className="mt-2 flex items-center gap-2">
              <input
                type="color"
                value={hex}
                onChange={(e) => onChange(e.target.value)}
                className="h-7 w-10 shrink-0 cursor-pointer rounded border border-slate-300 p-0.5"
              />
              <span className="text-[11px] text-slate-400">Custom</span>
              {value && (
                <button
                  type="button"
                  onClick={() => { onChange(""); setOpen(false); }}
                  className="ml-auto text-[11px] text-slate-400 hover:text-red-600"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
