"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Info, MinusCircle } from "lucide-react";
import { analyzeSeo, type SeoAnalysis, type SeoInput, type Severity } from "@/lib/seoAnalysis";

const ICON: Record<Severity, { icon: typeof CheckCircle2; cls: string }> = {
  good: { icon: CheckCircle2, cls: "text-emerald-500" },
  ok: { icon: MinusCircle, cls: "text-amber-500" },
  bad: { icon: AlertCircle, cls: "text-red-500" },
  info: { icon: Info, cls: "text-slate-400" },
};

/**
 * The analysis, kept fresh as the author types.
 *
 * Debounced, because it walks every block: a keystroke in a 3,000-word post
 * should not re-run it on the way down. The first run is immediate so the
 * panel is never blank.
 */
function useAnalysis(input: SeoInput): SeoAnalysis {
  const [result, setResult] = useState<SeoAnalysis>(() => analyzeSeo(input));
  const key = useMemo(() => JSON.stringify([input.title, input.seoTitle, input.seoDescription, input.seoKeywords, input.slug, input.excerpt, input.featuredImage, input.titleHidden]), [input]);
  useEffect(() => {
    const t = setTimeout(() => setResult(analyzeSeo(input)), 600);
    return () => clearTimeout(t);
    // `key` covers the scalar fields; `content` is a new array on every edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, input.content]);
  return result;
}

export default function SeoAnalysisPanel(props: SeoInput) {
  const a = useAnalysis(props);
  const tone = a.score >= 80 ? "text-emerald-600" : a.score >= 50 ? "text-amber-600" : "text-red-600";
  const ring = a.score >= 80 ? "#10b981" : a.score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <div
          className="grid h-14 w-14 shrink-0 place-items-center rounded-full"
          style={{ background: `conic-gradient(${ring} ${a.score * 3.6}deg, #e2e8f0 0)` }}
          aria-label={`SEO score ${a.score} out of 100`}
        >
          <div className="grid h-11 w-11 place-items-center rounded-full bg-white">
            <span className={`text-sm font-bold ${tone}`}>{a.score}</span>
          </div>
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            {a.score >= 80 ? "Good to publish" : a.score >= 50 ? "Nearly there" : "Needs work"}
          </p>
          <p className="text-[11px] text-slate-500">
            {a.words.toLocaleString()} words · {a.readingMinutes} min read
            {a.keyword ? ` · keyword “${a.keyword}”` : ""}
          </p>
        </div>
      </div>

      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {a.findings.map((f) => {
          const { icon: Icon, cls } = ICON[f.severity];
          return (
            <li key={f.id} className="flex items-start gap-2 px-3 py-2">
              <Icon size={14} className={`mt-0.5 shrink-0 ${cls}`} />
              <div className="min-w-0">
                <p className="text-xs font-medium text-slate-800">{f.label}</p>
                {f.detail && <p className="text-[11px] leading-relaxed text-slate-500">{f.detail}</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
