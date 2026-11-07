"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  FileText,
  File,
  Home,
  Tag,
  Image,
  Settings,
  Rocket,
  HeartPulse,
  Package,
  Clock,
  Link2,
  AlertOctagon,
  ExternalLink,
  ChevronRight,
  Users,
  Navigation,
  Paintbrush,
  Search,
  Blocks,
  Inbox,
  Tags,
  MessageSquare,
  MessageCircle,
  Gauge,
  Mail,
  PlugZap,
} from "lucide-react";

type NavItem = {
  label: string;
  href: string;
  icon: React.ElementType;
  exact?: boolean;
};

const navGroups: { label: string; items: NavItem[] }[] = [
  {
    label: "Content",
    items: [
      { label: "Dashboard", href: "/admin", icon: LayoutDashboard, exact: true },
      { label: "Posts", href: "/admin/posts", icon: FileText },
      { label: "Stale Content", href: "/admin/posts/stale", icon: Clock },
      { label: "Pages", href: "/admin/pages", icon: File },
      // Its own entry because a homepage is the one document whose URL is not
      // its slug, and with several languages there is one of them per language.
      { label: "Homepages", href: "/admin/homepages", icon: Home },
      { label: "Categories", href: "/admin/categories", icon: Tag },
      { label: "Tags", href: "/admin/tags", icon: Tags },
      { label: "Comments", href: "/admin/comments", icon: MessageSquare },
      { label: "Media", href: "/admin/media", icon: Image },
    ],
  },
  {
    label: "Site",
    items: [
      // Everything about how the site looks lives in the Customizer.
      { label: "Customize", href: "/admin/customize", icon: Paintbrush },
      { label: "SEO", href: "/admin/seo", icon: Search },
      { label: "Speed", href: "/admin/speed", icon: Gauge },
      { label: "Link Checker", href: "/admin/links", icon: Link2 },
      { label: "Navigation", href: "/admin/navigation", icon: Navigation },
      { label: "Elements", href: "/admin/elements", icon: Blocks },
      { label: "Forms", href: "/admin/forms", icon: Inbox },
      { label: "Plugins", href: "/admin/plugins", icon: Package },
    ],
  },
  {
    label: "Admin",
    items: [
      { label: "Users", href: "/admin/users", icon: Users },
      { label: "Settings", href: "/admin/settings", icon: Settings },
      // Password-reset and form emails; set up once, by picking a provider.
      { label: "Email", href: "/admin/email", icon: Mail },
      { label: "Site Health", href: "/admin/health", icon: HeartPulse },
      { label: "Errors", href: "/admin/errors", icon: AlertOctagon },
      // Last in the admin group: it is the thing you visit occasionally, not
      // daily, and it sits next to Settings because that is where someone
      // looks when they want to know what this install *is*.
      { label: "Updates", href: "/admin/updates", icon: Rocket },
    ],
  },
];

/** What an author's admin contains — the rest is hidden here and refused by middleware. */
const AUTHOR_HREFS = new Set(["/admin", "/admin/posts", "/admin/posts/stale", "/admin/media"]);

/**
 * Screens only an administrator can actually use.
 *
 * Editors were shown the whole menu. Some of these answer `notFound()` for
 * them — Link Checker, Plugins, Site Health, Errors, Updates, Users — so the
 * link led to a 404 from inside their own admin. The rest were worse: SEO,
 * Speed, Settings, Navigation and Elements opened, let an editor change
 * things, and then refused the save, because the settings API rejects the
 * keys they touch (`ADMIN_ONLY_SETTING` in lib/settings.ts). Work typed into
 * a form that will not save is the same defect as a switch that does nothing.
 *
 * Hiding is not the access control — every one of these enforces its own rule
 * server-side. This only stops the menu promising something it cannot do.
 */
const ADMIN_ONLY_HREFS = new Set([
  "/admin/seo",
  "/admin/speed",
  "/admin/settings",
  "/admin/navigation",
  "/admin/elements",
  "/admin/links",
  "/admin/plugins",
  "/admin/users",
  "/admin/health",
  "/admin/errors",
  "/admin/updates",
  "/admin/customize",
  // Choosing a homepage writes a site setting the API keeps for administrators.
  "/admin/homepages",
  "/admin/email",
]);

/**
 * `role` comes from the layout's server session, not `useSession()`. The
 * client session is refetched whenever the tab regains focus, and when that
 * fetch fails (the app restarting on shared hosting) it becomes null — the
 * role read as undefined, the menu fell to the editor branch, and half the
 * sidebar vanished until a refresh.
 */
export default function Sidebar({ role, userId }: { role?: string; userId?: string }) {
  const pathname = usePathname();
  const visibleGroups =
    role === "author"
      ? navGroups
          .map((g) => ({ ...g, items: g.items.filter((i) => AUTHOR_HREFS.has(i.href)) }))
          .filter((g) => g.items.length > 0)
      : role === "admin"
        ? navGroups
        : // Editor, or any role that is not an administrator: content screens
          // only. See ADMIN_ONLY_HREFS.
          navGroups
            .map((g) => ({ ...g, items: g.items.filter((i) => !ADMIN_ONLY_HREFS.has(i.href)) }))
            .filter((g) => g.items.length > 0);

  // Every role has one: it opens your own profile at the Connect Claude box
  // (ApiTokensPanel). `exact` with a #hash never matches a pathname, so it is
  // never highlighted alongside Users.
  const groups = userId
    ? visibleGroups.map((g, i) =>
        i === visibleGroups.length - 1
          ? { ...g, items: [...g.items, { label: "Connect Claude", href: `/admin/users/${userId}#connect-claude`, icon: PlugZap, exact: true }] }
          : g
      )
    : visibleGroups;

  function isActive(href: string, exact?: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    // Sticky, a full window tall: on a long screen (Site Health, a big post
    // list) the menu stays in reach instead of scrolling away. The nav list
    // scrolls on its own when the window is shorter than the menu.
    <aside className="w-60 shrink-0 bg-slate-900 h-screen sticky top-0 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-brand-500 rounded-lg flex items-center justify-center shrink-0">
            <span className="text-white text-sm font-bold">B</span>
          </div>
          <div>
            <span className="text-white font-semibold text-sm block leading-tight">
              BMS by{" "}
              <a
                href="https://facebook.com/rehanmubarak32/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-brand-400 hover:text-brand-300 hover:underline"
              >
                Rehan
              </a>
            </span>
            <span className="text-slate-500 text-[10px] leading-tight block">For bloggers, by a blogger</span>
          </div>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.label}>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-600 px-3 mb-1.5">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active = isActive(item.href, item.exact);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      active
                        ? "bg-brand-600 text-white"
                        : "text-slate-400 hover:text-white hover:bg-slate-800"
                    )}
                  >
                    <item.icon size={16} />
                    {item.label}
                    {active && <ChevronRight size={14} className="ml-auto" />}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="px-3 py-4 border-t border-slate-800 space-y-1">
        <a
          href="https://whatsapp.com/channel/0029VabLVkeDeONB6gNs6U1h"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <MessageCircle size={16} />
          Join WhatsApp channel
        </a>
        <Link
          href="/"
          target="_blank"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <ExternalLink size={16} />
          View site
        </Link>
      </div>
    </aside>
  );
}
