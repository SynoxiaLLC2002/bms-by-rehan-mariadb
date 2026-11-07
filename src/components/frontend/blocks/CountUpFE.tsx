"use client";

import { useEffect, useRef, useState } from "react";

interface Props { to: number; prefix: string; suffix: string; title: string; duration: number; color: string }

export default function CountUpFE({ to, prefix, suffix, title, duration, color }: Props) {
  const [value, setValue] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const start = performance.now();
        const ms = duration * 1000;
        function tick(now: number) {
          const progress = Math.min((now - start) / ms, 1);
          setValue(Math.round(progress * to));
          if (progress < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [to, duration]);

  return (
    <div ref={ref} className="text-center py-4">
      <div className="text-4xl font-bold" style={{ color }}>{prefix}{value}{suffix}</div>
      {title && <div className="text-sm text-slate-500 mt-2">{title}</div>}
    </div>
  );
}
