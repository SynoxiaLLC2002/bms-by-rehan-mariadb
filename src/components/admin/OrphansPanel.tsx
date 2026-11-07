import Link from "next/link";
import { Link2Off, Unlink2 } from "lucide-react";
import type { OrphanDoc, OrphanReport } from "@/lib/orphans";

// Server-rendered: the report is built from the database on each view.

function Row({ d }: { d: OrphanDoc }) {
  const edit = d.kind === "post" ? `/admin/posts/${d.id}` : `/admin/pages/${d.id}`;
  return (
    <li className="flex items-center gap-3 px-5 py-2.5">
      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${d.kind === "post" ? "bg-sky-50 text-sky-700" : "bg-violet-50 text-violet-700"}`}>{d.kind}</span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{d.title}</p>
        <p className="truncate font-mono text-[11px] text-slate-400">{d.path}</p>
      </div>
      {d.inMenu && <span className="text-[10px] text-slate-400">in menu</span>}
      <Link href={edit} className="text-[11px] font-medium text-brand-600 hover:underline">Open</Link>
    </li>
  );
}

export default function OrphansPanel({ report }: { report: OrphanReport }) {
  return (
    <div className="card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
            <Link2Off size={15} className="text-amber-600" /> Orphaned content
          </p>
          <p className="mt-0.5 max-w-2xl text-xs text-slate-500">
            Published posts and pages that no other post, page or menu links to. Search engines find these only through the sitemap,
            and they get none of the ranking internal links pass on. Open one of your <em>related</em> posts and add a link to it —
            the editor&apos;s SEO tab → Link suggestions makes that one click.
          </p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <p><span className="text-lg font-bold text-slate-900">{report.orphans.length}</span> orphaned</p>
          <p>{report.weak.length} with one link · {report.total} checked</p>
        </div>
      </div>
      {report.orphans.length === 0 ? (
        <p className="px-5 py-6 text-center text-sm text-slate-500">{report.total === 0 ? "Nothing published yet." : "Every published post and page is linked from somewhere."}</p>
      ) : (
        <ul className="divide-y divide-slate-100">{report.orphans.map((d) => <Row key={`${d.kind}-${d.id}`} d={d} />)}</ul>
      )}
      {report.weak.length > 0 && (
        <details className="border-t border-slate-100">
          <summary className="flex cursor-pointer items-center gap-2 px-5 py-3 text-xs font-semibold text-slate-600">
            <Unlink2 size={13} /> Only one link pointing here ({report.weak.length}) — worth one more
          </summary>
          <ul className="divide-y divide-slate-100 border-t border-slate-100">{report.weak.map((d) => <Row key={`${d.kind}-${d.id}`} d={d} />)}</ul>
        </details>
      )}
    </div>
  );
}
