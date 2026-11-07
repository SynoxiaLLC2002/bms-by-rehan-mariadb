"use client";

import { useState } from "react";
import ApiTokensPanel from "./ApiTokensPanel";
import { useRouter } from "next/navigation";
import { ArrowLeft, Save, Shield, ShieldCheck, ShieldOff, RefreshCw, Image as ImageIcon } from "lucide-react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import MediaPicker from "@/components/admin/MediaPicker";

interface UserEditorProps {
  user: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    totpEnabled: boolean | null;
    lastLogin: Date | null;
    createdAt: Date;
    // The public author profile — everything a byline points at.
    slug?: string | null;
    image?: string | null;
    bio?: string | null;
    website?: string | null;
    twitter?: string | null;
    linkedin?: string | null;
    facebook?: string | null;
    instagram?: string | null;
    github?: string | null;
    youtube?: string | null;
    seoTitle?: string | null;
    seoDescription?: string | null;
    canonicalUrl?: string | null;
    ogImage?: string | null;
    noIndex?: boolean | null;
    publicProfile?: boolean | null;
    /** "ltr" / "rtl" override for the author page, or null to follow its language. */
    direction?: string | null;
    /** `<html lang>` override for the author page, or null to follow whichever address it's read at. */
    language?: string | null;
    pageLayout?: string | null;
    contentStyle?: string | null;
    verticalSpacing?: string | null;
    cssClasses?: string | null;
    customCss?: string | null;
    scriptHead?: string | null;
    scriptBodyEnd?: string | null;
    transparentHeader?: string | null;
    disableHeader?: boolean | null;
    disableFooter?: boolean | null;
  };
  /** Only an administrator may set raw markup, CSS, or the chrome toggles. */
  isAdmin?: boolean;
  /** The signed-in person editing their own account — asks for the current password. */
  isSelf?: boolean;
  /** Where this author's page lives, so the editor can link to it. */
  authorUrl?: string;
  /** The site's configured content languages, for the author page's Language override. */
  languages?: { code: string; name: string }[];
}

export default function UserEditor({ user, authorUrl, languages = [], isAdmin = false, isSelf = false }: UserEditorProps) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: user.name ?? "",
    email: user.email ?? "",
    password: "",
    currentPassword: "",
    role: user.role,
    slug: user.slug ?? "",
    image: user.image ?? "",
    bio: user.bio ?? "",
    website: user.website ?? "",
    twitter: user.twitter ?? "",
    linkedin: user.linkedin ?? "",
    facebook: user.facebook ?? "",
    instagram: user.instagram ?? "",
    github: user.github ?? "",
    youtube: user.youtube ?? "",
    direction: user.direction ?? "",
    language: user.language ?? "",
    seoTitle: user.seoTitle ?? "",
    seoDescription: user.seoDescription ?? "",
    canonicalUrl: user.canonicalUrl ?? "",
    ogImage: user.ogImage ?? "",
    noIndex: !!user.noIndex,
    publicProfile: user.publicProfile ?? false,
    pageLayout: user.pageLayout ?? "default",
    contentStyle: user.contentStyle ?? "default",
    verticalSpacing: user.verticalSpacing ?? "default",
    cssClasses: user.cssClasses ?? "",
    customCss: user.customCss ?? "",
    scriptHead: user.scriptHead ?? "",
    scriptBodyEnd: user.scriptBodyEnd ?? "",
    transparentHeader: user.transparentHeader ?? "default",
    disableHeader: !!user.disableHeader,
    disableFooter: !!user.disableFooter,
  });
  const [showMedia, setShowMedia] = useState<null | "avatar" | "og">(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 2FA state
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [totpCode, setTotpCode] = useState("");
  const [twoFAEnabled, setTwoFAEnabled] = useState(!!user.totpEnabled);
  const [twoFAError, setTwoFAError] = useState("");
  const [twoFASuccess, setTwoFASuccess] = useState("");
  const [disablePassword, setDisablePassword] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const body: Record<string, string | boolean> = {
      name: form.name,
      email: form.email,
      role: form.role,
      // The public profile travels with the account fields — one form, one save.
      slug: form.slug,
      image: form.image,
      bio: form.bio,
      website: form.website,
      twitter: form.twitter,
      linkedin: form.linkedin,
      facebook: form.facebook,
      instagram: form.instagram,
      github: form.github,
      youtube: form.youtube,
      direction: form.direction,
      language: form.language,
      seoTitle: form.seoTitle,
      seoDescription: form.seoDescription,
      canonicalUrl: form.canonicalUrl,
      ogImage: form.ogImage,
      noIndex: form.noIndex,
      publicProfile: form.publicProfile,
      pageLayout: form.pageLayout,
      contentStyle: form.contentStyle,
      verticalSpacing: form.verticalSpacing,
      cssClasses: form.cssClasses,
      // Sent only by an administrator; the API refuses them otherwise, so
      // an editor must not include the keys at all.
      ...(isAdmin ? {
        customCss: form.customCss,
        scriptHead: form.scriptHead,
        scriptBodyEnd: form.scriptBodyEnd,
        transparentHeader: form.transparentHeader,
        disableHeader: form.disableHeader,
        disableFooter: form.disableFooter,
      } : {}),
    };
    if (form.password) body.password = form.password;
    // The API asks for it when you change your own password or email.
    if (form.currentPassword) body.currentPassword = form.currentPassword;

    const res = await fetch(`/api/users/${user.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    setSaving(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to update");
    } else {
      router.refresh();
    }
  }

  async function handleSetup2FA() {
    setTwoFALoading(true);
    setTwoFAError("");
    const res = await fetch(`/api/users/${user.id}/2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "setup" }),
    });
    const data = await res.json();
    setTwoFALoading(false);
    if (res.ok) {
      setQrCode(data.qrCode);
      setSecret(data.secret);
      return;
    }
    // A refused setup used to do nothing at all: no QR appeared and no reason
    // was given, so the button looked broken. It can now legitimately refuse —
    // 403 for someone else's account, 409 when 2FA is already on — and both
    // are worth reading.
    setTwoFAError(data.error || "Could not start two-factor setup.");
  }

  async function handleVerify2FA() {
    setTwoFALoading(true);
    setTwoFAError("");
    const res = await fetch(`/api/users/${user.id}/2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "verify", token: totpCode }),
    });
    const data = await res.json();
    setTwoFALoading(false);
    if (res.ok) {
      setTwoFAEnabled(true);
      setQrCode(null);
      setSecret(null);
      setTotpCode("");
      setTwoFASuccess("Google Authenticator enabled successfully.");
    } else {
      setTwoFAError(data.error || "Invalid code");
    }
  }

  async function handleDisable2FA() {
    // The API asks for the signed-in person's own password (see the route).
    const password = disablePassword;
    if (!password) {
      setTwoFAError("Enter your password to turn off two-factor authentication.");
      return;
    }
    if (!confirm("Disable 2FA for this user?")) return;
    setTwoFALoading(true);
    setTwoFAError("");
    setTwoFASuccess("");
    const res = await fetch(`/api/users/${user.id}/2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "disable", password }),
    }).catch(() => null);
    setTwoFALoading(false);
    if (!res?.ok) {
      const data = await res?.json().catch(() => null);
      setTwoFAError(data?.error || "Could not turn off two-factor authentication.");
      return;
    }
    setDisablePassword("");
    setTwoFAEnabled(false);
    setTwoFASuccess("2FA has been disabled.");
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/admin/users" className="btn-ghost gap-1.5 text-xs">
          <ArrowLeft size={14} /> Users
        </Link>
      </div>

      <div className="space-y-6">
        {/* Profile */}
        <div className="card p-6">
          <h2 className="font-semibold text-slate-900 mb-5">Profile</h2>
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{error}</div>
          )}
          <form onSubmit={handleSave} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Name</label>
                <input type="text" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} disabled={!isAdmin} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="author">Author — writes and publishes their own posts only</option>
                  <option value="editor">Editor — all posts, pages, categories, media and comments</option>
                  <option value="admin">Administrator — everything, including users and settings</option>
                </select>
              </div>
            </div>
            <div>
              <label className="label">Email</label>
              <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            </div>
            <div>
              <label className="label">New Password <span className="text-slate-400 font-normal">(leave blank to keep current)</span></label>
              <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="••••••••" minLength={8} autoComplete="new-password" />
            </div>
            {isSelf && (form.password || form.email.trim().toLowerCase() !== (user.email ?? "").toLowerCase()) && (
              <div>
                <label className="label">Current Password <span className="text-slate-400 font-normal">(required to change your password or email)</span></label>
                <input type="password" className="input" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} required autoComplete="current-password" />
              </div>
            )}
            {/* ── The public author page ───────────────────────────────────
                Separated from the account fields above by a rule, because the
                two answer different questions: everything above is how this
                person signs in, everything below is how readers see them. */}
            <div id="author-page" className="scroll-mt-6 border-t border-slate-100 pt-5">
              <div className="mb-4 flex items-center gap-3">
                <h3 className="text-sm font-semibold text-slate-900">Author page</h3>
                {form.publicProfile && form.slug && authorUrl && (
                  <a
                    href={authorUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-slate-400 hover:text-slate-700"
                  >
                    View
                  </a>
                )}
                {form.publicProfile && form.slug && (
                  <Link
                    href={`/admin/users/${user.id}/author-page`}
                    className="text-[11px] text-brand-600 hover:text-brand-700 font-medium"
                  >
                    Edit author page →
                  </Link>
                )}
                <label className="ml-auto flex items-center gap-2 text-[11px] text-slate-600">
                  <input
                    type="checkbox"
                    checked={form.publicProfile}
                    onChange={(e) => setForm({ ...form, publicProfile: e.target.checked })}
                    className="rounded border-slate-300"
                  />
                  Has a public page
                </label>
              </div>

              {!form.publicProfile ? (
                <p className="rounded-lg bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-500">
                  This account has no author page. Its byline still shows the name, but it is not a
                  link and the URL 404s — which is what you want for an account that only moderates
                  or edits, rather than writes.
                </p>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="label">Profile slug</label>
                      <input
                        type="text"
                        className="input font-mono text-xs"
                        value={form.slug}
                        onChange={(e) => setForm({ ...form, slug: e.target.value })}
                        placeholder="author-name"
                      />
                      <p className="mt-1 text-[11px] text-slate-400">
                        The last part of the author page URL. Must be unique.
                      </p>
                    </div>
                    <div>
                      <label className="label">Photo</label>
                      {form.image ? (
                        <div className="flex items-center gap-2">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={form.image} alt="" className="h-10 w-10 rounded-full object-cover" />
                          <button type="button" onClick={() => setShowMedia("avatar")} className="text-[11px] text-brand-600 hover:underline">Replace</button>
                          <button type="button" onClick={() => setForm({ ...form, image: "" })} className="text-[11px] text-slate-400 hover:text-red-600">Remove</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => setShowMedia("avatar")} className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-brand-400">
                          <ImageIcon size={14} /> Add photo
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="label">Biography</label>
                    <textarea
                      className="input min-h-[90px]"
                      value={form.bio}
                      onChange={(e) => setForm({ ...form, bio: e.target.value })}
                      placeholder="Shown on the author page and under every post this person writes."
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {(
                      [
                        ["website", "Website"],
                        ["twitter", "X / Twitter"],
                        ["linkedin", "LinkedIn"],
                        ["github", "GitHub"],
                        ["instagram", "Instagram"],
                        ["facebook", "Facebook"],
                        ["youtube", "YouTube"],
                      ] as const
                    ).map(([k, label]) => (
                      <div key={k}>
                        <label className="label">{label}</label>
                        <input
                          type="url"
                          className="input text-xs"
                          value={form[k]}
                          onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                          placeholder="https://…"
                        />
                      </div>
                    ))}
                    <div className="space-y-3">
                      <div>
                        <label className="label">Language</label>
                        <select
                          className="input text-xs"
                          value={form.language}
                          onChange={(e) => setForm({ ...form, language: e.target.value })}
                        >
                          <option value="">Auto — follows the address it&rsquo;s read at</option>
                          {languages.map((l) => (
                            <option key={l.code} value={l.code}>{l.name} ({l.code})</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="label">Text Direction</label>
                        <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-100 p-1">
                          {[
                            ["", "Auto"],
                            ["ltr", "LTR"],
                            ["rtl", "RTL"],
                          ].map(([value, label]) => (
                            <button
                              key={value}
                              type="button"
                              onClick={() => setForm({ ...form, direction: value })}
                              className={`rounded-md px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                                form.direction === value ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800"
                              }`}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        <p className="mt-1 text-[11px] text-slate-400">
                          Auto follows the language this page is being read in. Override only if this
                          biography is written the other way.
                        </p>
                      </div>
                    </div>
                  </div>
                  <p className="text-[11px] leading-relaxed text-slate-400">
                    Full URLs only — anything that is not http or https is dropped rather than
                    rendered as a link. These also become the profile&rsquo;s <code>sameAs</code>{" "}
                    entries, which is how a search engine knows these accounts are the same person.
                  </p>

                  <div className="border-t border-slate-100 pt-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Search appearance
                    </p>
                    <div className="space-y-3">
                      <div>
                        <label className="label">SEO title</label>
                        <input type="text" className="input" value={form.seoTitle} onChange={(e) => setForm({ ...form, seoTitle: e.target.value })} placeholder="Falls back to the name" />
                      </div>
                      <div>
                        <label className="label">Meta description</label>
                        <textarea className="input min-h-[64px]" value={form.seoDescription} onChange={(e) => setForm({ ...form, seoDescription: e.target.value })} placeholder="Falls back to the biography" />
                      </div>
                      <div>
                        <label className="label">Canonical URL</label>
                        <input type="text" className="input" value={form.canonicalUrl} onChange={(e) => setForm({ ...form, canonicalUrl: e.target.value })} placeholder="Leave blank to point at this page itself" />
                      </div>
                      <div>
                        <label className="label">Social image</label>
                        {form.ogImage ? (
                          <div className="flex items-center gap-2">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={form.ogImage} alt="" className="h-12 w-20 rounded border border-slate-200 object-cover" />
                            <button type="button" onClick={() => setShowMedia("og")} className="text-[11px] text-brand-600 hover:underline">Replace</button>
                            <button type="button" onClick={() => setForm({ ...form, ogImage: "" })} className="text-[11px] text-slate-400 hover:text-red-600">Remove</button>
                          </div>
                        ) : (
                          <button type="button" onClick={() => setShowMedia("og")} className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 hover:border-brand-400">
                            <ImageIcon size={14} /> Add image
                          </button>
                        )}
                        <p className="mt-1 text-[11px] text-slate-400">Falls back to the photo.</p>
                      </div>
                      <label className="flex items-center gap-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form.noIndex} onChange={(e) => setForm({ ...form, noIndex: e.target.checked })} className="rounded border-slate-300" />
                        Keep this author page out of search results
                      </label>
                    </div>
                  </div>

                  {/* The same layout choices a page has. An author page was the
                      only public document with no say over its own width, so a
                      site whose archives use a sidebar got one everywhere but
                      here. `default` follows the Customizer as it always did. */}
                  <div className="border-t border-slate-100 pt-4">
                    <p className="mb-3 text-[11px] font-bold uppercase tracking-wider text-slate-500">
                      Page layout
                    </p>
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="label">Width</label>
                        <select className="input text-xs" value={form.pageLayout} onChange={(e) => setForm({ ...form, pageLayout: e.target.value })}>
                          <option value="default">Follow site default</option>
                          <option value="normal">Normal</option>
                          <option value="narrow">Narrow</option>
                          <option value="wide">Wide</option>
                          <option value="fullwidth">Full width</option>
                          <option value="left-sidebar">Left sidebar</option>
                          <option value="right-sidebar">Right sidebar</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Content style</label>
                        <select className="input text-xs" value={form.contentStyle} onChange={(e) => setForm({ ...form, contentStyle: e.target.value })}>
                          <option value="default">Follow site default</option>
                          <option value="boxed">Boxed</option>
                          <option value="unboxed">Unboxed</option>
                        </select>
                      </div>
                      <div>
                        <label className="label">Spacing</label>
                        <select className="input text-xs" value={form.verticalSpacing} onChange={(e) => setForm({ ...form, verticalSpacing: e.target.value })}>
                          <option value="default">Follow site default</option>
                          <option value="enable">Large</option>
                          <option value="disable">None</option>
                          <option value="top-only">Top only</option>
                          <option value="bottom-only">Bottom only</option>
                        </select>
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="label">Extra CSS classes</label>
                      <input type="text" className="input font-mono text-xs" value={form.cssClasses} onChange={(e) => setForm({ ...form, cssClasses: e.target.value })} placeholder="my-class another-class" />
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <label className="label">Transparent header</label>
                        <select className="input text-xs" value={form.transparentHeader} onChange={(e) => setForm({ ...form, transparentHeader: e.target.value })}>
                          <option value="default">Follow site default</option>
                          <option value="enable">Transparent</option>
                          <option value="disable">Solid</option>
                        </select>
                      </div>
                      <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form.disableHeader} onChange={(e) => setForm({ ...form, disableHeader: e.target.checked })} className="rounded border-slate-300" />
                        Hide header
                      </label>
                      <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                        <input type="checkbox" checked={form.disableFooter} onChange={(e) => setForm({ ...form, disableFooter: e.target.checked })} className="rounded border-slate-300" />
                        Hide footer
                      </label>
                    </div>

                    {/* Raw markup and stylesheets are an administrator's to
                        write. This screen also lets a user edit themselves, and
                        an author page is a public URL — so an editor able to put
                        script on their own profile would be a privilege
                        escalation dressed up as a profile field. The API
                        enforces this; the fields are simply not shown. */}
                    {isAdmin ? (
                      <>
                        <div className="mt-3">
                          <label className="label">Custom CSS for this page</label>
                          <textarea className="input min-h-[72px] font-mono text-xs" value={form.customCss} onChange={(e) => setForm({ ...form, customCss: e.target.value })} placeholder=".archive-card { … }" />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div>
                            <label className="label">Head markup</label>
                            <textarea className="input min-h-[64px] font-mono text-xs" value={form.scriptHead} onChange={(e) => setForm({ ...form, scriptHead: e.target.value })} placeholder="<meta …>" />
                          </div>
                          <div>
                            <label className="label">End-of-body markup</label>
                            <textarea className="input min-h-[64px] font-mono text-xs" value={form.scriptBodyEnd} onChange={(e) => setForm({ ...form, scriptBodyEnd: e.target.value })} placeholder="<script>…</script>" />
                          </div>
                        </div>
                        <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                          Injected raw into this page only. Administrators only, because it runs on a
                          public URL.
                        </p>
                      </>
                    ) : (
                      <p className="mt-3 text-[11px] leading-relaxed text-slate-400">
                        Custom CSS and page markup for this profile are set by an administrator.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-2 text-xs text-slate-400">
              <span>Joined {formatDate(user.createdAt)} · Last login: {user.lastLogin ? formatDate(user.lastLogin) : "Never"}</span>
              <button type="submit" disabled={saving} className="btn-primary">
                <Save size={14} />
                {saving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </form>

          {showMedia && (
            <MediaPicker
              onSelect={(url) => {
                setForm((f) => ({ ...f, [showMedia === "avatar" ? "image" : "ogImage"]: url }));
                setShowMedia(null);
              }}
              onClose={() => setShowMedia(null)}
            />
          )}
        </div>

        {/* 2FA */}
        <div className="card p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="font-semibold text-slate-900 flex items-center gap-2">
                {twoFAEnabled ? <ShieldCheck size={16} className="text-green-600" /> : <Shield size={16} className="text-slate-400" />}
                Google Authenticator (2FA)
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {twoFAEnabled ? "Two-factor authentication is enabled." : "Add an extra layer of security to this account."}
              </p>
            </div>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${twoFAEnabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
              {twoFAEnabled ? "Enabled" : "Disabled"}
            </span>
          </div>

          {twoFASuccess && (
            <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-3 rounded-lg mb-4">{twoFASuccess}</div>
          )}
          {twoFAError && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">{twoFAError}</div>
          )}

          {!twoFAEnabled && !qrCode && (
            <button onClick={handleSetup2FA} disabled={twoFALoading} className="btn-secondary">
              <RefreshCw size={14} className={twoFALoading ? "animate-spin" : ""} />
              Setup Google Authenticator
            </button>
          )}

          {qrCode && secret && (
            <div className="space-y-4">
              <div className="bg-slate-50 rounded-xl p-5 text-center">
                <p className="text-sm text-slate-600 mb-3">Scan this QR code with your Google Authenticator app</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={qrCode} alt="2FA QR Code" className="w-48 h-48 mx-auto rounded-lg" />
                <p className="text-xs text-slate-400 mt-3">Or enter this code manually:</p>
                <code className="text-xs bg-white border border-slate-200 px-3 py-1.5 rounded-lg mt-1 inline-block font-mono tracking-widest">
                  {secret}
                </code>
              </div>

              <div>
                <label className="label">Enter the 6-digit code from your app to confirm</label>
                <div className="flex gap-3">
                  <input
                    type="text"
                    className="input font-mono tracking-widest text-center text-lg"
                    value={totpCode}
                    onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                  />
                  <button
                    onClick={handleVerify2FA}
                    disabled={totpCode.length !== 6 || twoFALoading}
                    className="btn-primary shrink-0"
                  >
                    {twoFALoading ? "Verifying…" : "Verify & Enable"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {twoFAEnabled && (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="password"
                autoComplete="current-password"
                className="input max-w-xs text-sm"
                placeholder="Your password"
                aria-label="Your password, to confirm"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
              />
              <button onClick={handleDisable2FA} disabled={twoFALoading || !disablePassword} className="btn-danger">
                <ShieldOff size={14} />
                Disable 2FA
              </button>
            </div>
          )}
        </div>

        {(isSelf || isAdmin) && <ApiTokensPanel userId={user.id} isSelf={isSelf} userRole={user.role} />}
      </div>
    </div>
  );
}
