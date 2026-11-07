"use client";

import { useState } from "react";
import { Database } from "lucide-react";

/**
 * Step 0 of first-run setup, shown while the site has no database: one button
 * that has cPanel create it (api/setup/database). Where that is impossible
 * (not cPanel), the manual way instead.
 */
export default function DatabaseStep({ canCreate, needsToken }: { canCreate: boolean; needsToken: boolean }) {
  const [setupToken, setSetupToken] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/setup/database", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ setupToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "The database could not be created.");
        return;
      }
      window.location.reload(); // the page now shows the account step
    } catch {
      setError("The database could not be created.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-sm border border-gray-200 p-8">
        <div className="flex items-center gap-3 mb-2">
          <Database className="w-7 h-7 text-indigo-600" aria-hidden />
          <h1 className="text-xl font-semibold text-gray-900">Create the database</h1>
        </div>
        {canCreate ? (
          <form onSubmit={create} className="space-y-4">
            <p className="text-sm text-gray-600">
              This site has no database yet. Press the button and it is created on your hosting account for you, with its own user and a strong password. Nothing to copy or type.
            </p>
            {needsToken && (
              <label className="block">
                <span className="block text-sm font-medium text-gray-700 mb-1">Setup token</span>
                <input
                  type="password"
                  value={setupToken}
                  onChange={(e) => setSetupToken(e.target.value)}
                  required
                  autoComplete="off"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                />
              </label>
            )}
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "Creating the database… (up to a minute)" : "Create the database"}
            </button>
          </form>
        ) : (
          <div className="space-y-3 text-sm text-gray-600">
            <p>This site has no database yet, and this server cannot create one automatically.</p>
            <ol className="list-decimal ml-5 space-y-1">
              <li>Create a MariaDB/MySQL database and a user with all privileges on it.</li>
              <li>
                Add the variable <code>DATABASE_URL</code> = <code>mysql://USER:PASSWORD@localhost:3306/DATABASE</code> to the app (cPanel → Setup Node.js App, or <code>.env.local</code>).
              </li>
              <li>Restart the app and reload this page.</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
