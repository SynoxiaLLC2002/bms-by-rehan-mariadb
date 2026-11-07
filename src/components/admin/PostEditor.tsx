"use client";

import TagInput from "@/components/admin/TagInput";
import { editorSpacingClass, editorWidthClass, fromLocalInput, toLocalInput } from "./editorCanvas";

import { useState, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { SeoData } from "@/components/editor/SeoPanel";
import { BLOCK_SETTING_TYPES } from "@/components/editor/blockPanelTypes";
import { subscribeActiveBlock, flushNestedEditors, getEditorDocument } from "@/lib/blockSettingsStore";
import ListView from "@/components/editor/ListView";
import EditorBoundary from "@/components/editor/EditorBoundary";
import { EditorTools, Breadcrumb } from "@/components/editor/EditorChrome";
import TranslationsPanel from "@/components/admin/TranslationsPanel";
import { toSlug } from "@/lib/utils";
import { contentLanguages, documentDir, siteTimeZone } from "@/lib/locale";
import { Save, ArrowLeft, Eye, EyeOff, ExternalLink, Monitor, Tablet, Smartphone, Image as ImageIcon } from "lucide-react";
import StrandedLanguageNotice from "@/components/admin/StrandedLanguageNotice";
import DocumentLanguagePanel from "@/components/admin/DocumentLanguagePanel";
import EditLock from "@/components/admin/EditLock";
import { useLocalBackup, backupTime } from "@/components/admin/useLocalBackup";
import Link from "next/link";
import type { Post, Category } from "@/lib/db/schema";
import type { Block } from "@blocknote/core";
import DocumentCodePanel from "@/components/admin/DocumentCodePanel";
import RevisionsPanel from "@/components/admin/RevisionsPanel";

const DEVICE_WIDTHS: Record<string, number | undefined> = { desktop: undefined, tablet: 820, mobile: 420 };

const BlockEditor = dynamic(() => import("@/components/editor/BlockEditor"), { ssr: false });
// 6,300+ lines and only needed once the "Block" sidebar tab is actually open.
const BlockPanel = dynamic(() => import("@/components/editor/BlockPanel"), { ssr: false });
// The SEO tab's three panels — and the keyword analyser behind them — only
// render once the user switches to that tab, which most edits never do.
const SeoPanel = dynamic(() => import("@/components/editor/SeoPanel"), { ssr: false });
const SeoAnalysisPanel = dynamic(() => import("@/components/editor/SeoAnalysisPanel"), { ssr: false });
const LinkSuggestions = dynamic(() => import("@/components/editor/LinkSuggestions"), { ssr: false });
// A modal: nothing until the featured-image button is pressed.
const MediaPicker = dynamic(() => import("@/components/admin/MediaPicker"), { ssr: false });

type AnyBlock = Record<string, any>;

interface PostEditorProps {
  post?: Post;
  categories: Category[];
  /** Tag names already on this post — the editor works in names, not ids. */
  tags?: string[];
  /**
   * The path this post is published at, resolved from the permalink structure
   * by the server. The editor cannot work it out: the structure is a site
   * setting and this is a client component.
   */
  permalink?: string;
  /** Which language this post belongs to. Content is partitioned by it. */
  language?: string;
  /** Site settings, for the language list. Same reason as `permalink`. */
  settings?: Record<string, string>;
  /** code -> display name, resolved server-side where the language table lives. */
  languageNames?: Record<string, string>;
  /** Documents already linked as translations of this one. */
  translations?: {
    id: number; language: string; slug: string; title: string; status: string; path: string;
  }[];
  /**
   * Whether the signed-in user may write per-document CSS and scripts.
   *
   * Resolved on the server from the session's role. The API enforces the same
   * rule independently — this only decides whether the fields are editable, so
   * a forged prop buys nothing.
   */
  isAdmin?: boolean;
}

/**
 * `datetime-local` wants `YYYY-MM-DDTHH:mm` in *local* time, while the column
 * stores an instant. Converting through the timezone offset keeps what the
 * author sees equal to what they picked.
 */




// ── Layout picker SVG icons ────────────────────────────────────────────────
function LayoutSVG({ type, active }: { type: string; active: boolean }) {
  const fill = active ? "#0ea5e9" : "#e2e8f0";
  const textFill = active ? "#bae6fd" : "#f1f5f9";

  const icons: Record<string, React.ReactNode> = {
    default: (
      <svg viewBox="0 0 44 32" fill="none" className="w-full h-full">
        <rect width="44" height="32" rx="3" fill={active ? "#e0f2fe" : "#f8fafc"} stroke={active ? "#0ea5e9" : "#e2e8f0"} strokeWidth="1.5"/>
        <rect x="4" y="4" width="36" height="3" rx="1" fill={fill}/>
        <rect x="8" y="10" width="28" height="2" rx="0.5" fill={textFill}/>
        <rect x="8" y="14" width="28" height="2" rx="0.5" fill={textFill}/>
        <rect x="8" y="18" width="18" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="24" width="36" height="3" rx="1" fill={fill}/>
      </svg>
    ),
    normal: (
      <svg viewBox="0 0 44 32" fill="none" className="w-full h-full">
        <rect width="44" height="32" rx="3" fill={active ? "#e0f2fe" : "#f8fafc"} stroke={active ? "#0ea5e9" : "#e2e8f0"} strokeWidth="1.5"/>
        <rect x="4" y="4" width="36" height="3" rx="1" fill={fill}/>
        <rect x="4" y="10" width="36" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="14" width="36" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="18" width="24" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="24" width="36" height="3" rx="1" fill={fill}/>
      </svg>
    ),
    narrow: (
      <svg viewBox="0 0 44 32" fill="none" className="w-full h-full">
        <rect width="44" height="32" rx="3" fill={active ? "#e0f2fe" : "#f8fafc"} stroke={active ? "#0ea5e9" : "#e2e8f0"} strokeWidth="1.5"/>
        <rect x="4" y="4" width="36" height="3" rx="1" fill={fill}/>
        <rect x="13" y="10" width="18" height="2" rx="0.5" fill={textFill}/>
        <rect x="13" y="14" width="18" height="2" rx="0.5" fill={textFill}/>
        <rect x="13" y="18" width="12" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="24" width="36" height="3" rx="1" fill={fill}/>
      </svg>
    ),
    wide: (
      <svg viewBox="0 0 44 32" fill="none" className="w-full h-full">
        <rect width="44" height="32" rx="3" fill={active ? "#e0f2fe" : "#f8fafc"} stroke={active ? "#0ea5e9" : "#e2e8f0"} strokeWidth="1.5"/>
        <rect x="4" y="4" width="36" height="3" rx="1" fill={fill}/>
        <rect x="2" y="10" width="40" height="2" rx="0.5" fill={textFill}/>
        <rect x="2" y="14" width="40" height="2" rx="0.5" fill={textFill}/>
        <rect x="2" y="18" width="28" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="24" width="36" height="3" rx="1" fill={fill}/>
      </svg>
    ),
    fullwidth: (
      <svg viewBox="0 0 44 32" fill="none" className="w-full h-full">
        <rect width="44" height="32" rx="3" fill={active ? "#e0f2fe" : "#f8fafc"} stroke={active ? "#0ea5e9" : "#e2e8f0"} strokeWidth="1.5"/>
        <rect x="0" y="4" width="44" height="3" fill={fill}/>
        <rect x="0" y="10" width="44" height="2" fill={textFill}/>
        <rect x="0" y="14" width="44" height="2" fill={textFill}/>
        <rect x="0" y="18" width="30" height="2" fill={textFill}/>
        <rect x="0" y="24" width="44" height="3" fill={fill}/>
      </svg>
    ),
    "left-sidebar": (
      <svg viewBox="0 0 44 32" fill="none" className="w-full h-full">
        <rect width="44" height="32" rx="3" fill={active ? "#e0f2fe" : "#f8fafc"} stroke={active ? "#0ea5e9" : "#e2e8f0"} strokeWidth="1.5"/>
        <rect x="4" y="4" width="36" height="3" rx="1" fill={fill}/>
        <rect x="4" y="9" width="11" height="16" rx="1" fill={fill}/>
        <rect x="18" y="10" width="22" height="2" rx="0.5" fill={textFill}/>
        <rect x="18" y="14" width="22" height="2" rx="0.5" fill={textFill}/>
        <rect x="18" y="18" width="14" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="27" width="36" height="3" rx="1" fill={fill}/>
      </svg>
    ),
    "right-sidebar": (
      <svg viewBox="0 0 44 32" fill="none" className="w-full h-full">
        <rect width="44" height="32" rx="3" fill={active ? "#e0f2fe" : "#f8fafc"} stroke={active ? "#0ea5e9" : "#e2e8f0"} strokeWidth="1.5"/>
        <rect x="4" y="4" width="36" height="3" rx="1" fill={fill}/>
        <rect x="4" y="10" width="22" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="14" width="22" height="2" rx="0.5" fill={textFill}/>
        <rect x="4" y="18" width="14" height="2" rx="0.5" fill={textFill}/>
        <rect x="29" y="9" width="11" height="16" rx="1" fill={fill}/>
        <rect x="4" y="27" width="36" height="3" rx="1" fill={fill}/>
      </svg>
    ),
  };

  return <>{icons[type] ?? icons.default}</>;
}

const LAYOUT_OPTIONS = [
  { value: "default",       label: "Default" },
  { value: "normal",        label: "Normal" },
  { value: "narrow",        label: "Narrow" },
  { value: "wide",          label: "Wide" },
  { value: "fullwidth",     label: "Fullwidth" },
  { value: "left-sidebar",  label: "Left Sidebar" },
  { value: "right-sidebar", label: "Right Sidebar" },
];

// ── Reusable toggle-group component ───────────────────────────────────────
function ToggleGroup({ value, onChange, options }: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex rounded-lg overflow-hidden border border-slate-200">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 py-1.5 text-[10px] font-semibold tracking-wide uppercase transition-colors ${
            value === opt.value
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-600"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ── Setting row ────────────────────────────────────────────────────────────
function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────
export default function PostEditor({
  post, categories, tags = [], permalink = "", language: initialLanguage, settings = {},
  languageNames = {}, translations = [], isAdmin = false,
}: PostEditorProps) {
  const router = useRouter();
  const isEdit = !!post;
  // A new post gets its id from its first save. Autosave makes that save
  // itself now (see the autosave below) and the editor carries on in place,
  // so this is the id from then on.
  const [createdId, setCreatedId] = useState<number | null>(null);
  const docId: number | null = post?.id ?? createdId;

  // Content fields
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [excerpt, setExcerpt] = useState(post?.excerpt ?? "");
  const [featuredImage, setFeaturedImage] = useState(post?.featuredImage ?? "");
  const [status, setStatus] = useState(post?.status ?? "draft");
  // Was never editable: `published_at` was stamped "now" the first time you
  // pressed Publish and kept forever after. Fine for something written today,
  // wrong for anything imported or backdated — and under a dated permalink the
  // date is *in the URL*, so a wrong date is a wrong address. It also feeds
  // `article:published_time` and `datePublished`.
  const [publishedAt, setPublishedAt] = useState(toLocalInput(post?.publishedAt, siteTimeZone(settings)));
  // Per-document CSS and scripts. The API refuses these from a non-admin
  // independently of the UI — this only decides whether the fields are editable.
  const [code, setCode] = useState({
    customCss: post?.customCss ?? "",
    scriptHead: post?.scriptHead ?? "",
    scriptBodyEnd: post?.scriptBodyEnd ?? "",
  });
  const [categoryId, setCategoryId] = useState<string>(post?.categoryId?.toString() ?? "");
  const [tagNames, setTagNames] = useState<string[]>(tags);
  const [content, setContent] = useState<Block[]>((post?.content as Block[]) ?? []);
  const [seo, setSeo] = useState<SeoData>({
    seoTitle: post?.seoTitle ?? "",
    seoDescription: post?.seoDescription ?? "",
    seoKeywords: post?.seoKeywords ?? "",
    ogTitle: post?.ogTitle ?? "",
    ogDescription: post?.ogDescription ?? "",
    ogImage: post?.ogImage ?? "",
    twitterTitle: post?.twitterTitle ?? "",
    twitterDescription: post?.twitterDescription ?? "",
    twitterImage: post?.twitterImage ?? "",
    canonicalUrl: post?.canonicalUrl ?? "",
    noIndex: post?.noIndex ?? false,
    noFollow: post?.noFollow ?? false,
    robotsAdvanced: post?.robotsAdvanced ?? null,
    schemaType: post?.schemaType ?? "Article",
    schemas: post?.schemas ?? "",
  });

  // Design settings
  const [transparentHeader, setTransparentHeader] = useState(post?.transparentHeader ?? "default");
  const [showTitle, setShowTitle] = useState(post?.showTitle ?? "default");
  const [showComments, setShowComments] = useState(post?.showComments ?? "default");
  const [postLayout, setPostLayout] = useState(post?.postLayout ?? "default");
  const [contentStyle, setContentStyle] = useState(post?.contentStyle ?? "default");
  const [verticalSpacing, setVerticalSpacing] = useState(post?.verticalSpacing ?? "default");
  const [showFeaturedImage, setShowFeaturedImage] = useState(post?.showFeaturedImage ?? "default");
  const [cssClasses, setCssClasses] = useState(post?.cssClasses ?? "");
  const [disableHeader, setDisableHeader] = useState(post?.disableHeader ?? false);
  const [disableFooter, setDisableFooter] = useState(post?.disableFooter ?? false);

  // UI state
  const [saving, setSaving] = useState(false);
  const [slugEdited, setSlugEdited] = useState(isEdit);
  // Not editable after the fact: moving a post between languages would move it
  // out from under every link and listing that already points at it. A post is
  // created in a language and stays there.
  // Falls back to the post's own column, so a caller that forgets the prop
  // cannot silently label a French post as English -- see PageEditor, where
  // exactly that hid the language row and the homepage notice.
  // Changed from the Post tab (DocumentLanguagePanel) and saved with the post
  // — the update route does the actual move.
  const [language, setLanguage] = useState(initialLanguage ?? post?.language ?? "en");
  /** "ltr" / "rtl" override, or "" to follow the language. */
  const [direction, setDirection] = useState(post?.direction ?? "");
  // Arabic, Urdu, Hebrew, Persian: typed right-to-left, as they will render.
  const dir = documentDir(language, settings, direction);
  // The version this editor loaded; sent with every save so a stale copy
  // (another tab, another person) cannot overwrite a newer one. See
  // lib/staleSave.ts. Null once a conflict is known: saving stays off until
  // the page is reloaded.
  const [loadedAt, setLoadedAt] = useState<string | null>(post?.updatedAt ? new Date(post.updatedAt).toISOString() : null);
  const [conflict, setConflict] = useState<string | null>(null);
  // A failed save (signed out, server error) must be visible: it used to leave
  // the amber dot on and say nothing, and a reload later lost the work.
  const [saveError, setSaveError] = useState<string | null>(null);
  // Autosave of a *published* document goes here, not to the live row —
  // see useLocalBackup. Keyed by document so each has its own slot.
  const backup = useLocalBackup<Record<string, unknown>>(`bms-backup:post:${docId ?? "new"}`, post?.updatedAt);
  // Bumped to remount the block editor with restored content.
  const [editorKey, setEditorKey] = useState(0);
  const [sidebarTab, setSidebarTab] = useState<"post" | "seo" | "design" | "block">("post");
  const [dirty, setDirty] = useState(false);
  const [showMedia, setShowMedia] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [listOpen, setListOpen] = useState(true);

  // Auto-switch to Block tab when a configurable block is selected in the editor
  useEffect(() => {
    return subscribeActiveBlock((block) => {
      if (block && BLOCK_SETTING_TYPES.has(block.type)) setSidebarTab("block");
    });
  }, []);

  // Mark dirty whenever any tracked field changes (after first mount).
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    setDirty(true);
  // `publishedAt` and `code` were missing (PageEditor had them): changing only
  // the publish date or the custom CSS/scripts never marked the post unsaved,
  // so nothing autosaved it and leaving the page gave no warning.
  }, [title, slug, excerpt, content, featuredImage, status, publishedAt, code, categoryId, tagNames, seo,
      transparentHeader, showTitle, showComments, postLayout, contentStyle, verticalSpacing,
      showFeaturedImage, cssClasses, disableHeader, disableFooter]);

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTitle(e.target.value);
    if (!slugEdited) setSlug(toSlug(e.target.value));
  };

  const handleContentChange = useCallback((blocks: Block[]) => {
    setContent(blocks);
  }, []);


  /** Everything a save sends — and everything a browser backup keeps. */
  function buildBody(saveStatus?: string) {
    // Row Layout columns debounce their edits into the row; flush them,
    // then read the editor itself rather than the state it last pushed.
    flushNestedEditors();
    const latest = (getEditorDocument() as Block[] | null) ?? content;
    return {
      title, slug, excerpt, featuredImage, content: latest, language, direction,
      status: saveStatus ?? status,
      // Sent as an instant; the server validates and ignores nonsense.
      publishedAt: fromLocalInput(publishedAt, siteTimeZone(settings)),
      // Omitted entirely for a non-admin: sending them at all is what the
      // API refuses, so an editor saving normally must not include the keys.
      ...(isAdmin ? code : {}),
      categoryId: categoryId ? parseInt(categoryId) : null,
      tags: tagNames,
      transparentHeader, showTitle, showComments, postLayout, contentStyle,
      verticalSpacing, showFeaturedImage,
      cssClasses: cssClasses || null,
      disableHeader, disableFooter,
      ...seo,
      expectedUpdatedAt: loadedAt,
    };
  }

  async function handleSave(saveStatus?: string, auto = false) {
    if (conflict) return;
    setSaving(true);
    // "Save Draft" and "Publish" pass a status explicitly. Writing it back into
    // state matters for more than the sidebar dropdown: the 20s autosave calls
    // this with no argument, so a status left only in the request body is
    // overwritten by the stale one on the very next tick — which made Save
    // Draft look like it did nothing and quietly republished the post.
    if (saveStatus && saveStatus !== status) setStatus(saveStatus);
    // Row Layout columns debounce their edits into the row; flush them,
    // then read the editor itself rather than the state it last pushed.
    // `autosave` lets the server space out revisions (lib/revisions.ts).
    const body = { ...buildBody(saveStatus), autosave: auto };

    const url = docId ? `/api/posts/${docId}` : "/api/posts";
    const method = docId ? "PATCH" : "POST";

    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch {
      setSaving(false);
      setSaveError("Could not reach the server — are you offline? Your changes are still here; they will be retried.");
      return;
    }

    setSaving(false);

    if (!res.ok && res.status !== 409) {
      const data = await res.json().catch(() => ({}));
      setSaveError(
        res.status === 401
          ? "Not signed in any more — your changes are still here. Sign in again in a new tab, then save."
          : res.status === 403
            ? "You are not allowed to save this " + "post" + "."
            : (data.error as string) || `Could not save (HTTP ${res.status}). Your changes are still here — try again.`
      );
      return;
    }
    setSaveError(null);
    if (res.ok) backup.clear();
    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      setConflict(data.error || "This post was changed somewhere else. Reload to continue.");
      // Keep what was just refused. Reloading loads the other version, and
      // without this copy everything typed since the last good save was gone
      // (see useLocalBackup: Backup.conflict).
      {
        const { autosave: _a, expectedUpdatedAt: _e, ...mine } = body as Record<string, unknown>;
        backup.writeConflict(mine);
      }
      return;
    }
    if (res.ok) {
      setDirty(false);
      const data = await res.json();
      // The row's new version, so the next save is measured against it.
      if (data.post?.updatedAt) setLoadedAt(new Date(data.post.updatedAt).toISOString());
      // The server has the last word on the slug: it makes it unique, so a
      // title that collides with an existing one comes back as `…-2`. Without
      // syncing it the field would keep showing what was asked for while the
      // post lived somewhere else.
      const savedSlug = data.post?.slug;
      if (typeof savedSlug === "string" && savedSlug && savedSlug !== slug) {
        setSlug(savedSlug);
        setSlugEdited(true);
      }
      if (!docId) {
        if (auto) {
          // Created by autosave: stay in this editor, mid-sentence, and only
          // move the address bar — navigating would remount the editor and
          // drop whatever was typed while the request was out.
          setCreatedId(data.post.id);
          window.history.replaceState(null, "", `/admin/posts/${data.post.id}`);
        } else router.push(`/admin/posts/${data.post.id}`);
      } else if (post) router.refresh();
    }
  }

  // Ctrl/Cmd+S to save
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        // The buttons carry `disabled={saving}` and the autosave checks it too;
        // this was the one save path that did not. A second Ctrl+S while the
        // first request is still out sends the same `expectedUpdatedAt`, so the
        // server answers 409 and the editor accuses the user of editing the
        // document somewhere else — over their own save.
        if (saving || conflict) return;
        // Many settings fields commit on blur, not on every keystroke. With
        // the caret still in one, Ctrl+S saved without the last edit — the
        // mouse path worked only because clicking Update blurs the field.
        // Blur first, then save once that commit has landed.
        const active = document.activeElement as HTMLElement | null;
        // The main text area writes every keystroke already, and blurring it
        // would drop the caret on each save — so only fields are blurred, and
        // get their focus back once the save is on its way.
        if (active && active !== document.body && !active.classList.contains("ProseMirror")) {
          active.blur();
          requestAnimationFrame(() => {
            handleSave();
            if (active.isConnected) active.focus({ preventScroll: true });
          });
        } else {
          handleSave();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Warn before leaving with unsaved changes
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirty) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  // Autosave existing posts every 20s when there are unsaved changes
  const saveRef = useRef<() => void>(() => {});
  saveRef.current = () => {
    // After a refused save nothing reaches the server; keep the conflict
    // copy current instead, so typing after the warning is not lost either.
    if (conflict) {
      if (dirty) backup.writeConflict(buildBody());
      return;
    }
    if (!dirty || saving) return;
    // A published post must not change on the site until Update is pressed —
    // its autosave is a browser backup. A draft is not public: it autosaves
    // to the database so a crash cannot lose it.
    //
    // A post that was never saved used to be skipped by both, so a crashed
    // tab lost the whole first draft. It is backed up in the browser, and
    // once it has a title it is created as a draft.
    if (!docId) {
      backup.write(buildBody());
      if (title.trim() && status !== "published") handleSave(undefined, true);
      return;
    }
    if (status === "published") backup.write(buildBody());
    else handleSave(undefined, true);
  };
  useEffect(() => {
    const id = setInterval(() => saveRef.current(), 20000);
    return () => clearInterval(id);
  }, []);

  const blocks = content as AnyBlock[];

  function restoreBackup() {
    const d = (backup.pending?.data ?? {}) as Record<string, unknown>;
    if (d.title !== undefined) setTitle(String(d.title));
    if (d.slug !== undefined) { setSlug(String(d.slug)); setSlugEdited(true); }
    // The backup carries the date as an ISO instant ("" when unset); leaving it
    // out restored everything but a backdated or scheduled publish date.
    if (typeof d.publishedAt === "string") setPublishedAt(d.publishedAt ? toLocalInput(d.publishedAt, siteTimeZone(settings)) : "");
    if (d.featuredImage !== undefined) setFeaturedImage(String(d.featuredImage ?? ""));
    if (d.excerpt !== undefined) setExcerpt(String(d.excerpt ?? ""));
    if (d.categoryId !== undefined) setCategoryId(d.categoryId == null ? "" : String(d.categoryId));
    if (Array.isArray(d.tags)) setTagNames(d.tags.map(String));
    if (d.language !== undefined) setLanguage(String(d.language));
    if (d.direction !== undefined) setDirection(String(d.direction ?? ""));
    if (d.transparentHeader !== undefined) setTransparentHeader(String(d.transparentHeader));
    if (d.showTitle !== undefined) setShowTitle(String(d.showTitle));
    if (d.postLayout !== undefined) setPostLayout(String(d.postLayout));
    if (d.contentStyle !== undefined) setContentStyle(String(d.contentStyle));
    if (d.verticalSpacing !== undefined) setVerticalSpacing(String(d.verticalSpacing));
    if (d.showFeaturedImage !== undefined) setShowFeaturedImage(String(d.showFeaturedImage));
    if (d.showComments !== undefined) setShowComments(String(d.showComments));
    if (d.cssClasses !== undefined) setCssClasses(String(d.cssClasses ?? ""));
    if (d.disableHeader !== undefined) setDisableHeader(!!d.disableHeader);
    if (d.disableFooter !== undefined) setDisableFooter(!!d.disableFooter);
    if (d.scriptHead !== undefined || d.scriptBodyEnd !== undefined || d.customCss !== undefined) {
      setCode((c) => ({ ...c, scriptHead: String(d.scriptHead ?? c.scriptHead), scriptBodyEnd: String(d.scriptBodyEnd ?? c.scriptBodyEnd), customCss: String(d.customCss ?? c.customCss) }));
    }
    setSeo((s) => {
      const next = { ...s } as Record<string, unknown>;
      for (const k of Object.keys(s)) if (d[k] !== undefined) next[k] = d[k];
      return next as unknown as typeof s;
    });
    if (Array.isArray(d.content)) { setContent(d.content as Block[]); setEditorKey((k) => k + 1); }
    backup.clear();
    setDirty(true);
  }

  const restoreBar = backup.pending && (
    <div className="flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-900">
      <span>
        {backup.pending.conflict ? (
          <><strong>Your changes from {backupTime(backup.pending.at)} were not saved</strong> — someone else saved this post first, and theirs is what is loaded now. Restoring yours puts your version back in the editor; saving it then replaces theirs. </>
        ) : (
          <><strong>Unsaved changes from {backupTime(backup.pending.at)}</strong> were kept in this browser{" "}
        {docId ? "because this post is published — they are not on the site yet." : "from a new post that was never saved."}</>
        )}
      </span>
      <button type="button" className="btn-primary text-xs py-1" onClick={restoreBackup}>Restore them</button>
      <button type="button" className="btn-secondary text-xs py-1" onClick={() => backup.clear()}>Discard</button>
    </div>
  );

  const canvasInner = (
    <>
      <StrandedLanguageNotice
        kind="post"
        language={language}
        settings={settings}
        onMove={(code) => { setLanguage(code); setDirty(true); }}
      />
      {/* Hiding the title does not stop it mattering: it is still the browser
          tab, the SEO title, the name in every listing and the social preview.
          So the field stays editable and says so, rather than disappearing and
          leaving no way to fix the text that is still doing all that work. */}
      <div className={showTitle === "disable" ? "mb-5 opacity-60" : "mb-5"}>
        <input
          type="text"
          className={`w-full text-4xl font-bold placeholder-slate-300 border-0 outline-none bg-transparent leading-tight ${
            showTitle === "disable" ? "text-slate-400 line-through decoration-slate-300" : "text-slate-900"
          }`}
          value={title}
          onChange={handleTitleChange}
          placeholder="Post title"
          dir={dir}
        />
        {showTitle === "disable" && (
          <p className="mt-1 flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
            <EyeOff size={12} />
            Not shown on the post — still used for the browser tab, SEO, listings and social previews.
          </p>
        )}
      </div>
      {showFeaturedImage !== "disable" && featuredImage && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={featuredImage} alt="" className="w-full aspect-video object-cover rounded-xl mb-6" />
      )}
      <EditorBoundary>
        <BlockEditor key={editorKey} initialContent={content} onChange={handleContentChange} bare dir={dir} />
      </EditorBoundary>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Top bar */}
      <div className="flex items-center gap-3 px-4 h-14 border-b border-slate-200 shrink-0 bg-white">
        <Link href="/admin/posts" className="btn-ghost gap-1.5 text-xs">
          <ArrowLeft size={14} /> Posts
        </Link>
        <EditorTools listOpen={listOpen} onToggleList={() => setListOpen((v) => !v)} />
        <span className="text-sm font-semibold text-slate-700 truncate max-w-[220px]">{title || "Untitled post"}</span>

        {/* Save status */}
        <span className="text-[11px] font-medium">
          {saveError
            ? <span className="text-red-600" title={saveError}>⚠ Not saved — {saveError.split(" — ")[0]}</span>
            : conflict
            ? <span className="text-red-600" title={conflict}>⚠ Changed elsewhere — <button type="button" className="underline" onClick={() => window.location.reload()}>reload</button></span>
            : saving
            ? <span className="text-sky-500">Saving…</span>
            : dirty
              ? <span className="text-amber-500">● Unsaved changes{status === "published" ? " — backed up in this browser, press Update to publish" : ""}</span>
              : <span className="text-emerald-500">✓ Saved</span>}
        </span>

        <div className="flex-1" />

        {/* Device preview toggle */}
        <div className="hidden md:flex items-center gap-0.5 bg-slate-100 rounded-lg p-0.5 mr-1">
          {([["desktop", Monitor], ["tablet", Tablet], ["mobile", Smartphone]] as const).map(([d, Icon]) => (
            <button
              key={d}
              onClick={() => setDevice(d)}
              title={d}
              className={`w-7 h-7 flex items-center justify-center rounded-md transition-colors ${device === d ? "bg-white text-slate-800 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}
            >
              <Icon size={15} />
            </button>
          ))}
        </div>

        {/* The live post, once there is one to look at.
            `post.slug` rather than the slug in state: the link has to point at
            the URL the post is actually published under, and an edited-but-
            unsaved slug is not that URL yet. The save refreshes this prop. */}
        {/* `permalink` is resolved server-side by `postPath`, so it already
            carries the language prefix and the permalink structure. The old
            `/blog/${slug}` fallback guessed both and was wrong on every
            structure except the default one, so it is gone: with no resolved
            permalink there is no correct URL to offer. */}
        {isEdit && status === "published" && permalink && (
          <a
            href={permalink}
            target="_blank"
            rel="noreferrer"
            title="Open the published post in a new tab"
            className="btn-secondary gap-1.5 text-xs"
          >
            <ExternalLink size={14} /> View Post
          </a>
        )}
        {isEdit && (
          <button
            type="button"
            className="btn-secondary gap-1.5 text-xs"
            onClick={async () => {
              // Opened now, inside the click, so the browser does not treat
              // it as a popup; pointed at the preview once the draft is held.
              const win = window.open("about:blank", "_blank");
              const base = `/preview/post/${post.id}`;
              try {
                flushNestedEditors();
                const latest = (getEditorDocument() as Block[] | null) ?? content;
                const res = await fetch("/api/preview", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ kind: "post", id: post.id, data: { title, excerpt, featuredImage, content: latest, showTitle, showFeaturedImage, postLayout, contentStyle, verticalSpacing, transparentHeader, cssClasses: cssClasses || null, disableHeader, disableFooter } }),
                });
                const data = await res.json();
                const path = res.ok && data.token ? `${base}?draft=${data.token}` : base;
                // Absolute: the tab is `about:blank`, whose URL has no host. A
                // path like `/preview/…` can fail to resolve there and land on
                // a host error page instead of the preview.
                const url = new URL(path, window.location.origin).href;
                if (win) win.location.href = url;
                else window.open(url, "_blank");
              } catch {
                const fallback = new URL(base, window.location.origin).href;
                if (win) win.location.href = fallback;
              }
            }}
          >
            <Eye size={14} /> Preview
          </button>
        )}
        {/* WordPress's buttons, not "Save Draft / Publish" on everything.
            Save Draft on a *published* post set its status to draft — one click
            unpublished the homepage. A published document gets Update, and
            taking it offline is a separate, confirmed action. */}
        {status === "published" ? (
          <>
            <button
              onClick={() => {
                if (confirm("Switch this post to draft? It disappears from the site until it is published again.")) handleSave("draft");
              }}
              disabled={saving}
              className="btn-secondary"
              title="Take it off the site and keep editing it as a draft"
            >
              Switch to draft
            </button>
            <button onClick={() => handleSave("published")} disabled={saving} className="btn-primary">
              <Save size={16} />
              {saving ? "Saving…" : "Update"}
            </button>
          </>
        ) : (
          <>
            <button onClick={() => handleSave("draft")} disabled={saving} className="btn-secondary">
              Save Draft
            </button>
            <button onClick={() => handleSave("published")} disabled={saving} className="btn-primary">
              <Save size={16} />
              {saving ? "Saving…" : "Publish"}
            </button>
          </>
        )}
      </div>

      {restoreBar}
      <div className="flex-1 flex min-h-0">

        {/* ── Left: List View / Outline ─────────────────────────────── */}
        {listOpen && (
          <aside className="hidden lg:flex flex-col w-[260px] border-r border-slate-200 bg-white shrink-0">
            <ListView blocks={blocks} />
          </aside>
        )}

        {/* ── Center: WYSIWYG canvas ────────────────────────────────── */}
        <main className="flex-1 min-w-0 overflow-y-auto bg-slate-100/70 flex justify-center">
          <div
            // `self-start`: <main> is a single-line flex row with a fixed height,
            // and a stretched item is cut to that height — its content overflowed
            // past a viewport-tall box, so the theme background ended mid-scroll
            // and the admin grey showed under the rest. Sized to content instead;
            // min-h-full still fills the viewport for a short document.
            className={`bms-canvas self-start min-h-full w-full transition-all duration-300 ${device !== "desktop" ? "my-4 shadow-md rounded-xl border border-slate-200" : ""} ${editorSpacingClass(verticalSpacing)}`}
            style={{ maxWidth: DEVICE_WIDTHS[device] }}
          >
            {(postLayout === "left-sidebar" || postLayout === "right-sidebar") ? (
              <div className="max-w-5xl mx-auto px-4">
                <div className={`grid gap-6 ${postLayout === "left-sidebar" ? "md:grid-cols-[200px_1fr]" : "md:grid-cols-[1fr_200px]"}`}>
                  {postLayout === "left-sidebar" && (
                    <aside className="hidden md:block bg-white/60 border border-dashed border-slate-300 rounded-xl p-4 text-xs text-slate-400 h-fit">Sidebar</aside>
                  )}
                  <article className={contentStyle === "boxed" ? "bms-canvas-article is-boxed rounded-2xl shadow-sm p-6 md:p-8" : "bms-canvas-article"}>
                    {canvasInner}
                  </article>
                  {postLayout === "right-sidebar" && (
                    <aside className="hidden md:block bg-white/60 border border-dashed border-slate-300 rounded-xl p-4 text-xs text-slate-400 h-fit">Sidebar</aside>
                  )}
                </div>
              </div>
            ) : (
              <div className={`${editorWidthClass(postLayout)} mx-auto px-4`}>
                <article className={contentStyle === "boxed" ? "bms-canvas-article is-boxed rounded-2xl shadow-sm p-6 md:p-8" : "bms-canvas-article"}>
                  {canvasInner}
                </article>
              </div>
            )}
          </div>
        </main>

        {/* ── Right: Settings sidebar ───────────────────────────────── */}
        <aside className="hidden md:flex flex-col w-[320px] border-l border-slate-200 bg-white shrink-0">
          {/* Sidebar tabs */}
          <div className="flex border-b border-slate-100 shrink-0">
            {(["post", "seo", "design", "block"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setSidebarTab(tab)}
                className={`flex-1 py-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
                  sidebarTab === tab ? "text-slate-900 border-b-2 border-slate-900" : "text-slate-400 hover:text-slate-600"
                }`}
              >
                {tab === "post" ? "Post" : tab === "seo" ? "SEO" : tab === "design" ? "Design" : "Block"}
              </button>
            ))}
          </div>
          <div className="overflow-y-auto flex-1">

          {/* BLOCK tab */}
          <EditLock kind="post" id={post?.id} />
          {sidebarTab === "block" && <BlockPanel />}

          {/* POST tab */}
          {sidebarTab === "post" && (
            <div className="p-4 space-y-4">
              <DocumentLanguagePanel
                kind="post"
                language={language}
                direction={direction}
                settings={settings}
                onLanguage={(code) => { setLanguage(code); setDirty(true); }}
                onDirection={(v) => { setDirection(v); setDirty(true); }}
              />
              {contentLanguages(settings).length > 1 && (
                <TranslationsPanel
                  kind="post"
                  id={post?.id}
                  language={language}
                  languages={contentLanguages(settings)}
                  languageNames={languageNames}
                  initial={translations}
                />
              )}
              <div>
                <div className="flex items-center justify-between">
                  <label className="label mb-0">Publish Date</label>
                  {/* Resets to this moment, the way the reference editor's
                      "Now" does. Backdating is the common use of this field,
                      and once a date is in the box getting back to "today"
                      otherwise means typing it out. */}
                  <button
                    type="button"
                    onClick={() => setPublishedAt(toLocalInput(new Date(), siteTimeZone(settings)))}
                    className="text-[11px] font-medium text-brand-600 hover:text-brand-700"
                  >
                    Now
                  </button>
                </div>
                <input
                  type="datetime-local"
                  className="input mt-1"
                  value={publishedAt}
                  onChange={(e) => setPublishedAt(e.target.value)}
                />
                {(
                  <p className="mt-1 text-[11px] text-slate-400">Time in {siteTimeZone(settings)} — the site&apos;s time zone (Settings → Timezone).</p>
                )}
                {publishedAt && Date.parse(fromLocalInput(publishedAt, siteTimeZone(settings))) > Date.now() ? (
                  <p className="mt-1 rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-sky-800">
                    <strong>Scheduled.</strong> Set the status to Published and this post stays
                    hidden — off the archive, the feed, search and the sitemap — until this date,
                    then appears on its own.
                  </p>
                ) : (
                  <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                    {publishedAt
                      ? "Shown on the site, and used for the date in the URL if your permalink structure includes one."
                      : "Set automatically when you publish. Fill it in to backdate."}
                  </p>
                )}
              </div>
              <RevisionsPanel kind="post" id={post?.id} />
              <DocumentCodePanel
                value={code}
                onChange={setCode}
                canEdit={isAdmin}
                kind="post"
              />
              <div>
                <label className="label">Status</label>
                <select className="input" value={status} onChange={(e) => setStatus(e.target.value)}>
                  <option value="draft">Draft</option>
                  <option value="published">Published</option>
                </select>
              </div>
              {/* Per post, because a site-wide switch is the wrong grain: one
                  announcement that should not take comments used to mean
                  turning them off everywhere. */}
              <div>
                <label className="label">Comments</label>
                <select
                  className="input"
                  value={showComments}
                  onChange={(e) => setShowComments(e.target.value)}
                >
                  <option value="default">Follow the site setting</option>
                  <option value="enable">Show on this post</option>
                  <option value="disable">Hide on this post</option>
                </select>
                <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
                  Hidden means the section is not rendered at all — existing comments are kept,
                  they are simply not shown or fetched.
                </p>
              </div>
              <div>
                <label className="label">Permalink (slug)</label>
                <input
                  type="text"
                  className="input"
                  value={slug}
                  onChange={(e) => { setSlug(e.target.value); setSlugEdited(true); }}
                  placeholder="post-slug"
                  // A slug written in the document's language reads in that
                  // language's direction; left-to-right Arabic is unreadable.
                  dir={dir}
                />
                {permalink && (
                  <p className="mt-1 truncate font-mono text-[11px] text-slate-400" title={permalink}>
                    {permalink}
                  </p>
                )}
              </div>
              <div>
                <label className="label">Excerpt</label>
                <textarea
                  className="input resize-none"
                  rows={3}
                  value={excerpt}
                  onChange={(e) => setExcerpt(e.target.value)}
                  placeholder="Short description of this post"
                />
              </div>
              <div>
                <label className="label">Category</label>
                <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                  <option value="">— None —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Tags</label>
                <TagInput value={tagNames} onChange={setTagNames} />
              </div>
              <div>
                <label className="label">Featured Image</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    className="input"
                    value={featuredImage}
                    onChange={(e) => setFeaturedImage(e.target.value)}
                    placeholder="https://…"
                  />
                  <button type="button" onClick={() => setShowMedia(true)} className="btn-secondary shrink-0 px-2.5" title="Browse media">
                    <ImageIcon size={16} />
                  </button>
                </div>
              </div>
              {featuredImage && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={featuredImage} alt="Featured" className="rounded-lg w-full object-cover max-h-36" />
              )}
            </div>
          )}

          {/* SEO tab */}
          {sidebarTab === "seo" && (
            <>
            <SeoPanel
              compact
              data={seo}
              onChange={setSeo}
              title={title}
              kind="post"
              blocks={content}
              permalink={permalink}
            />
            <div className="border-t border-slate-100 p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">Content analysis</p>
              <SeoAnalysisPanel
                title={title}
                seoTitle={seo.seoTitle}
                seoDescription={seo.seoDescription}
                seoKeywords={seo.seoKeywords}
                slug={slug}
                excerpt={excerpt}
                featuredImage={featuredImage}
                content={content}
                titleHidden={showTitle === "disable"}
                siteOrigin={settings.site_url || ""}
              />
            </div>
            <div className="border-t border-slate-100 p-4">
              <LinkSuggestions keyword={seo.seoKeywords} title={title} language={language} excludePost={post?.id} content={content} />
            </div>
            </>
          )}

          {/* DESIGN tab */}
          {sidebarTab === "design" && (
            <div className="p-4 space-y-5">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Post Settings</p>

              <SettingRow label="Transparent Header">
                <ToggleGroup value={transparentHeader} onChange={setTransparentHeader}
                  options={[{ value: "default", label: "Default" }, { value: "enable", label: "Enable" }, { value: "disable", label: "Disable" }]} />
              </SettingRow>

              <SettingRow label="Post Title">
                <ToggleGroup value={showTitle} onChange={setShowTitle}
                  options={[{ value: "default", label: "Default" }, { value: "enable", label: "Enable" }, { value: "disable", label: "Disable" }]} />
              </SettingRow>

              <SettingRow label="Post Layout">
                <div className="grid grid-cols-3 gap-2">
                  {LAYOUT_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setPostLayout(opt.value)}
                      className="flex flex-col items-center gap-1.5 group"
                    >
                      <div className="w-full aspect-[1.4] rounded-md overflow-hidden">
                        <LayoutSVG type={opt.value} active={postLayout === opt.value} />
                      </div>
                      <span className={`text-[9px] font-semibold uppercase tracking-wide leading-none ${postLayout === opt.value ? "text-sky-500" : "text-slate-400"}`}>
                        {opt.label}
                      </span>
                    </button>
                  ))}
                </div>
              </SettingRow>

              <SettingRow label="Content Style">
                <ToggleGroup value={contentStyle} onChange={setContentStyle}
                  options={[{ value: "default", label: "Default" }, { value: "boxed", label: "Boxed" }, { value: "unboxed", label: "Unboxed" }]} />
              </SettingRow>

              <SettingRow label="Content Vertical Spacing">
                <div className="space-y-1.5">
                  <ToggleGroup value={verticalSpacing} onChange={setVerticalSpacing}
                    options={[{ value: "default", label: "Default" }, { value: "enable", label: "Enable" }, { value: "disable", label: "Disable" }]} />
                  <ToggleGroup value={verticalSpacing} onChange={setVerticalSpacing}
                    options={[{ value: "top-only", label: "Top Only" }, { value: "bottom-only", label: "Bottom Only" }]} />
                </div>
              </SettingRow>

              <SettingRow label="Show Featured Image">
                <ToggleGroup value={showFeaturedImage} onChange={setShowFeaturedImage}
                  options={[{ value: "default", label: "Default" }, { value: "enable", label: "Enable" }, { value: "disable", label: "Disable" }]} />
              </SettingRow>

              <SettingRow label="Additional CSS Classes">
                <input
                  type="text"
                  className="input text-xs"
                  value={cssClasses}
                  onChange={(e) => setCssClasses(e.target.value)}
                  placeholder="class-one class-two"
                />
                <p className="text-[10px] text-slate-400 leading-snug">Added to the post wrapper. Separate with spaces.</p>
              </SettingRow>

              <div className="border-t border-slate-100 pt-4 space-y-2">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disableHeader}
                    onChange={(e) => setDisableHeader(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-slate-900"
                  />
                  <span className="text-[11px] font-semibold text-slate-600">Disable Header</span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={disableFooter}
                    onChange={(e) => setDisableFooter(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 accent-slate-900"
                  />
                  <span className="text-[11px] font-semibold text-slate-600">Disable Footer</span>
                </label>
              </div>
            </div>
          )}
          </div>
        </aside>
      </div>

      <Breadcrumb root="Post" />

      {showMedia && (
        <MediaPicker onSelect={(url) => setFeaturedImage(url)} onClose={() => setShowMedia(false)} />
      )}
    </div>
  );
}
