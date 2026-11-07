/** Shown while an admin screen is loading, instead of a blank page. */
export default function AdminLoading() {
  return (
    <div className="p-6 space-y-4" aria-busy="true" aria-live="polite">
      <div className="h-4 w-40 rounded bg-slate-200 animate-pulse" />
      <div className="h-10 w-full max-w-xl rounded bg-slate-200 animate-pulse" />
      <div className="h-48 w-full rounded bg-slate-100 animate-pulse" />
    </div>
  );
}
