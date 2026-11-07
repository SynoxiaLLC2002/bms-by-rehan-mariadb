"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Header from "@/components/admin/Header";
import { ArrowLeft, Save } from "lucide-react";
import Link from "next/link";

export default function NewUserPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "editor" });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || "Failed to create user");
    } else {
      router.push("/admin/users");
    }
  }

  return (
    <>
      <Header title="Add User" />
      <main className="flex-1 p-6">
        <div className="max-w-lg">
          <div className="flex items-center gap-3 mb-6">
            <Link href="/admin/users" className="btn-ghost gap-1.5 text-xs">
              <ArrowLeft size={14} /> Users
            </Link>
          </div>

          <div className="card p-6">
            <h2 className="font-semibold text-slate-900 mb-5">New User</h2>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-lg mb-4">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="label">Name</label>
                <input type="text" className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Full name" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="user@example.com" required />
              </div>
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Minimum 8 characters" required minLength={8} />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  <option value="author">Author — writes and publishes their own posts only</option>
                  <option value="editor">Editor — all posts, pages, categories, media and comments</option>
                  <option value="admin">Administrator — everything, including users and settings</option>
                </select>
              </div>
              <div className="pt-2">
                <button type="submit" disabled={saving} className="btn-primary w-full">
                  <Save size={16} />
                  {saving ? "Creating…" : "Create User"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </>
  );
}
