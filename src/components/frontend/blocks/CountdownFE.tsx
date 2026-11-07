"use client";

import { useEffect, useState } from "react";

/**
 * The live digits of a countdown. The label and the "ended" text are drawn by
 * the server (see BlockRenderer), which also resolves `targetAt` in the site's
 * time zone — so every visitor counts down to the same instant.
 */
interface Props { targetAt: number; expiredText: string }

function pad(n: number) { return String(n).padStart(2, "0"); }

export default function CountdownFE({ targetAt, expiredText }: Props) {
  const [diff, setDiff] = useState<number | null>(null);

  useEffect(() => {
    const tick = () => setDiff(Math.max(0, targetAt - Date.now()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetAt]);

  if (diff === null) return null;
  if (diff === 0) return <p className="text-slate-600">{expiredText}</p>;

  const days = Math.floor(diff / 86400000);
  const hrs = Math.floor((diff % 86400000) / 3600000);
  const min = Math.floor((diff % 3600000) / 60000);
  const sec = Math.floor((diff % 60000) / 1000);

  return (
    <div className="flex justify-center gap-4" role="timer" aria-live="off">
      {[["Days", days], ["Hrs", hrs], ["Min", min], ["Sec", sec]].map(([label, val]) => (
        <div key={label as string} className="text-center">
          <div className="bg-slate-900 text-white rounded-xl px-4 py-3 text-3xl font-mono font-bold min-w-[64px]">
            {pad(val as number)}
          </div>
          <div className="text-xs text-slate-400 mt-2">{label}</div>
        </div>
      ))}
    </div>
  );
}
