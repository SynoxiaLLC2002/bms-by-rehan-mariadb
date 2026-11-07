"use client";

import { signOut } from "next-auth/react";
import { LogOut, User } from "lucide-react";
import { useSession } from "next-auth/react";

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { data: session } = useSession();

  return (
    <header className="h-14 border-b border-slate-200 bg-white px-6 flex items-center justify-between shrink-0">
      <h1 className="text-slate-900 font-semibold text-sm">{title}</h1>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <div className="w-7 h-7 bg-brand-100 text-brand-700 rounded-full flex items-center justify-center">
            <User size={14} />
          </div>
          <span>{session?.user?.name || session?.user?.email}</span>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/admin/login" })}
          className="btn-ghost text-xs gap-1.5 px-2 py-1.5"
        >
          <LogOut size={14} />
          Sign out
        </button>
      </div>
    </header>
  );
}
