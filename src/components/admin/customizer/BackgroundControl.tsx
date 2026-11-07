"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CustomizerSettings } from "@/lib/appearanceSettings";
import { parseBackground, type BackgroundValue } from "@/lib/siteCss";
import { Swatch, type SetFn } from "./PanelKit";

const inputCls =
  "w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-500/40";
const smallCls =
  "w-full px-2 py-1.5 text-xs border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-brand-500/40";

const PRESET_GRADIENTS = [
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
  "linear-gradient(135deg,#4facfe,#00f2fe)",
  "linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.6))",
];

/**
 * A background that can be a solid colour, a gradient or an image.
 *
 * Colour mode writes a plain string so the value stays readable and older
 * saved colours keep working; the other modes write JSON.
 */
export function BackgroundControl({
  k, s, set, onPickImage,
}: {
  k: keyof CustomizerSettings;
  s: CustomizerSettings;
  set: SetFn;
  onPickImage?: (apply: (url: string) => void) => void;
}) {
  const value = parseBackground(String(s[k] ?? ""));
  const [tab, setTab] = useState<"color" | "gradient" | "image">(value?.type ?? "color");

  const write = (v: BackgroundValue) => set(k, JSON.stringify(v));
  const patch = (p: Partial<BackgroundValue>) => write({ ...(value ?? {}), ...p, type: tab });

  return (
    <div>
      <div className="flex border border-slate-300 rounded-lg overflow-hidden mb-3">
        {(["color", "gradient", "image"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => {
              setTab(t);
              // Switching mode shouldn't silently keep the old mode's output.
              if (t === "color") set(k, value?.color ?? "");
              else write({ ...(value ?? {}), type: t });
            }}
            className={cn(
              "flex-1 py-1.5 text-[11px] font-semibold uppercase tracking-wide transition-colors",
              tab === t ? "bg-brand-600 text-white" : "bg-white text-slate-500 hover:text-slate-800"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "color" && <Swatch k={k} s={s} set={set} />}

      {tab === "gradient" && (
        <>
          <input
            className={cn(inputCls, "font-mono text-xs")}
            value={value?.gradient ?? ""}
            placeholder="linear-gradient(135deg,#667eea,#764ba2)"
            onChange={(e) => patch({ gradient: e.target.value })}
          />
          <div className="flex gap-2 mt-2">
            {PRESET_GRADIENTS.map((g) => (
              <button
                key={g}
                type="button"
                title={g}
                onClick={() => patch({ gradient: g })}
                className={cn(
                  "h-7 flex-1 rounded border transition-transform hover:scale-105",
                  value?.gradient === g ? "border-brand-600 ring-2 ring-brand-300" : "border-slate-300"
                )}
                style={{ backgroundImage: g }}
              />
            ))}
          </div>
        </>
      )}

      {tab === "image" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            {value?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={value.image} alt="" className="h-12 w-20 object-cover rounded border border-slate-200" />
            ) : (
              <div className="h-12 w-20 rounded border border-dashed border-slate-300 bg-slate-50" />
            )}
            <button
              type="button"
              onClick={() => onPickImage?.((url) => patch({ image: url }))}
              className="px-3 py-2 text-sm border border-slate-300 rounded-lg hover:border-brand-400"
            >
              {value?.image ? "Change" : "Select Image"}
            </button>
            {value?.image && (
              <button type="button" onClick={() => patch({ image: "" })} className="text-xs text-slate-400 hover:text-red-600">
                Remove
              </button>
            )}
          </div>

          <input
            className={cn(inputCls, "font-mono text-xs")}
            value={value?.image ?? ""}
            placeholder="or paste an image URL"
            onChange={(e) => patch({ image: e.target.value })}
          />

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] text-slate-400">Size</span>
              <select className={smallCls} value={value?.size ?? "cover"} onChange={(e) => patch({ size: e.target.value })}>
                <option value="cover">Cover</option>
                <option value="contain">Contain</option>
                <option value="auto">Auto</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Repeat</span>
              <select className={smallCls} value={value?.repeat ?? "no-repeat"} onChange={(e) => patch({ repeat: e.target.value })}>
                <option value="no-repeat">No repeat</option>
                <option value="repeat">Repeat</option>
                <option value="repeat-x">Repeat X</option>
                <option value="repeat-y">Repeat Y</option>
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Position</span>
              <select className={smallCls} value={value?.position ?? "center center"} onChange={(e) => patch({ position: e.target.value })}>
                {["center center", "top left", "top center", "top right", "center left", "center right", "bottom left", "bottom center", "bottom right"].map((pos) => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] text-slate-400">Attachment</span>
              <select className={smallCls} value={value?.attachment ?? "scroll"} onChange={(e) => patch({ attachment: e.target.value })}>
                <option value="scroll">Scroll</option>
                <option value="fixed">Fixed (parallax)</option>
              </select>
            </label>
          </div>

          <label className="block">
            <span className="text-[10px] text-slate-400">Overlay — keeps text readable over a photo</span>
            <input
              className={cn(smallCls, "font-mono")}
              value={value?.overlay ?? ""}
              placeholder="rgba(0,0,0,.4)"
              onChange={(e) => patch({ overlay: e.target.value })}
            />
          </label>
        </div>
      )}
    </div>
  );
}
