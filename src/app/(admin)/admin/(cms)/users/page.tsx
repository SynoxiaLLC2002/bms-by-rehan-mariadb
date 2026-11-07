import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { desc } from "drizzle-orm";
import Header from "@/components/admin/Header";
import Link from "next/link";
import { Plus, Pencil, Shield, ShieldCheck, ExternalLink } from "lucide-react";
import { formatDate } from "@/lib/utils";
import UserDeleteButton from "@/components/admin/UserDeleteButton";
import { auth } from "@/lib/auth";
import { isAdmin } from "@/lib/authz";
import { redirect } from "next/navigation";
import { getSiteSettings } from "@/lib/settings";
import { authorPath } from "@/lib/permalinks";
import { defaultContentLanguage } from "@/lib/locale";

export default async function UsersPage() {
  const session = await auth();
  // Every account's email, role and 2FA state — the same list `/api/users`
  // gives administrators only. Anyone else is sent to their own profile.
  if (!isAdmin(session)) redirect(`/admin/users/${session?.user?.id ?? ""}`);
  // Deliberately after the guard, not parallel with auth(): this list is
  // every account's email and role, so it must not start before we know the
  // caller is an administrator. The settings read joins it here instead.
  const [allUsers, settings] = await Promise.all([
    db.query.users.findMany({
      orderBy: [desc(users.createdAt)],
      columns: {
        id: true, name: true, email: true, role: true,
        totpEnabled: true, lastLogin: true, createdAt: true,
        // Enough to tell whether this account already has an author page, so
        // the row can offer the right action rather than the same one twice.
        slug: true, publicProfile: true,
      },
    }),
    getSiteSettings(),
  ]);
  const lang = defaultContentLanguage(settings);

  return (
    <>
      <Header title="Users" />
      <main className="flex-1 p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">All Users</h2>
            <p className="text-sm text-slate-500">{allUsers.length} total</p>
          </div>
          <Link href="/admin/users/new" className="btn-primary">
            <Plus size={16} />
            Add User
          </Link>
        </div>

        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide">User</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden md:table-cell">Role</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">2FA</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden lg:table-cell">Last Login</th>
                <th className="text-left px-5 py-3 text-xs font-medium text-slate-500 uppercase tracking-wide hidden xl:table-cell">Joined</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {allUsers.map((user) => {
                const isMe = user.id === (session?.user as { id: string })?.id;
                return (
                  <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand-700 flex items-center justify-center text-xs font-semibold shrink-0">
                          {(user.name || user.email || "?")[0].toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-slate-800 flex items-center gap-1.5">
                            {user.name || "—"}
                            {isMe && <span className="text-xs bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">You</span>}
                          </div>
                          <div className="text-xs text-slate-400">{user.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3 hidden md:table-cell">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${
                        user.role === "admin"
                          ? "bg-brand-100 text-brand-700"
                          : "bg-slate-100 text-slate-600"
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell">
                      {user.totpEnabled ? (
                        <span className="flex items-center gap-1 text-green-600 text-xs font-medium">
                          <ShieldCheck size={14} /> Active
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-slate-400 text-xs">
                          <Shield size={14} /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 hidden lg:table-cell text-slate-500 text-xs">
                      {user.lastLogin ? formatDate(user.lastLogin) : "Never"}
                    </td>
                    <td className="px-5 py-3 hidden xl:table-cell text-slate-500 text-xs">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        {/* The author page, offered as whichever action makes
                            sense: a `+` to build one for an account that has
                            none, and a link to the live page once it exists.
                            Both land on the same screen — the second just has
                            somewhere to point first. */}
                        {user.publicProfile && user.slug ? (
                          <a
                            href={authorPath(user.slug, lang, settings)}
                            target="_blank"
                            rel="noreferrer"
                            className="btn-ghost p-1.5"
                            title="View author page"
                          >
                            <ExternalLink size={14} />
                          </a>
                        ) : (
                          <Link
                            href={`/admin/users/${user.id}#author-page`}
                            className="btn-ghost p-1.5"
                            title="Create the author page"
                          >
                            <Plus size={14} />
                          </Link>
                        )}
                        <Link href={`/admin/users/${user.id}`} className="btn-ghost p-1.5" title="Edit">
                          <Pencil size={14} />
                        </Link>
                        {!isMe && (
                          <UserDeleteButton
                            id={user.id as string}
                            name={user.name || user.email || ""}
                            others={allUsers
                              .filter((o) => o.id !== user.id)
                              .map((o) => ({ id: o.id as string, name: o.name || o.email || "Unnamed" }))}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>
    </>
  );
}
