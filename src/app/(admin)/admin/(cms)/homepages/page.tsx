// Every language's homepage, in one place.
//
// These were findable before — a picker in the Customizer and a badge in the
// Pages list — but you had to hold both in your head to answer "which page is
// French serving, and is it published yet". A homepage is also the one document
// whose URL is not its slug, which makes it odd enough to deserve its own
// screen rather than a row among ordinary pages.

import { db } from "@/lib/db";
import { getSiteSettings } from "@/lib/settings";
import { LANGUAGES, contentLanguages, defaultContentLanguage, languageLabel, languageName } from "@/lib/locale";
import { homepageId } from "@/lib/permalinks";
import Header from "@/components/admin/Header";
import Link from "next/link";
import { Pencil, Eye, Home, AlertCircle } from "lucide-react";
import { HomepagePicker, CreateHomepageButton, AddLanguageButton } from "@/components/admin/HomepageActions";

export default async function HomepagesPage() {
  const settings = await getSiteSettings();
  const languages = contentLanguages(settings);
  const defaultLang = defaultContentLanguage(settings);

  const allPages = await db.query.pages.findMany({
    columns: { id: true, title: true, slug: true, status: true, language: true },
  });

  const rows = languages.map((code) => {
    const settingKey = code === defaultLang ? "homepage_id" : `homepage_id_${code}`;
    const id = homepageId(code, settings);
    const page = id ? allPages.find((p) => p.id === id) ?? null : null;
    return {
      code,
      settingKey,
      url: code === defaultLang ? "/" : `/${code}`,
      page,
      // A homepage must be a page in its own language: content is not shared,
      // so the picker only ever offers that language's own pages.
      candidates: allPages.filter((p) => p.language === code),
      // Set to a page that belongs to another language — only reachable by
      // editing the setting by hand, but worth naming rather than rendering
      // something that looks fine.
      mismatched: !!page && page.language !== code,
    };
  });

  return (
    <>
      <Header title="Homepages" />
      <main className="flex-1 p-6">
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Homepages</h2>
            <p className="text-sm text-slate-500">
              What each language serves at its root. A homepage&apos;s URL is fixed — its slug does not decide its
              address, and visiting that slug redirects here.
            </p>
          </div>
          <AddLanguageButton
            configured={languages}
            options={LANGUAGES.filter((l) => !languages.includes(l.code)).map((l) => ({
              code: l.code,
              label: languageLabel(l),
            }))}
          />
        </div>

        <div className="space-y-3">
          {rows.map((row) => (
            <div key={row.code} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Home size={15} className="text-slate-400" />
                    <span className="font-semibold text-slate-900">{languageName(row.code)}</span>
                    {row.code === defaultLang && (
                      <span className="rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                        Default
                      </span>
                    )}
                    <code className="text-xs text-slate-400">{row.url}</code>
                  </div>

                  <div className="mt-2 text-sm">
                    {row.page ? (
                      <span className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/admin/pages/${row.page.id}`}
                          className="font-medium text-slate-800 hover:text-brand-600"
                        >
                          {row.page.title || "(untitled)"}
                        </Link>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            row.page.status === "published"
                              ? "bg-green-100 text-green-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {row.page.status}
                        </span>
                        {row.page.status !== "published" && (
                          <span className="text-xs text-slate-400">
                            — visitors will not see it until it is published
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        Showing the latest posts. Choose a page, or make a blank one to build.
                      </span>
                    )}
                  </div>

                  {row.mismatched && (
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-red-600">
                      <AlertCircle size={13} />
                      This page belongs to another language. Pick one written in {languageName(row.code)}.
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <HomepagePicker
                    languageCode={row.code}
                    settingKey={row.settingKey}
                    current={row.page?.id ?? null}
                    pages={row.candidates}
                  />
                  {row.candidates.length === 0 && (
                    <CreateHomepageButton
                      languageCode={row.code}
                      languageLabel={languageName(row.code)}
                      settingKey={row.settingKey}
                    />
                  )}
                  {row.page && (
                    <>
                      <Link href={`/admin/pages/${row.page.id}`} className="btn-ghost p-1.5" title="Edit">
                        <Pencil size={14} />
                      </Link>
                      <Link href={row.url} target="_blank" className="btn-ghost p-1.5" title="View">
                        <Eye size={14} />
                      </Link>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {languages.length === 1 && (
          <p className="mt-4 text-xs text-slate-400">
            Only one content language is configured. Add one above and it appears here with its own homepage —
            or manage the full list, including which language is the default, under{" "}
            <Link href="/admin/settings#languages" className="underline">
              Settings → Language &amp; Region
            </Link>
            .
          </p>
        )}
      </main>
    </>
  );
}
