"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Autosave for a published document, WordPress-style: to the browser, never
 * to the live page.
 *
 * The 20-second autosave used to write straight into the row whatever the
 * status — so on a published page, half a sentence went live every 20 s.
 * WordPress keeps such edits in an autosave slot and only "Update" touches
 * the post. This is that slot: a localStorage entry per document holding the
 * full save body. A draft still autosaves to the database (nothing is public,
 * and a crash must not lose it); a published document autosaves here, and
 * the person publishes when they mean to.
 *
 * On the next open, a backup newer than the row is offered back: "restore
 * unsaved changes from 10:42?" — the editor decides how to apply it.
 */
export interface Backup<T> {
  at: number;
  data: T;
  /**
   * The version a save was refused for (409: someone else saved first).
   * Offered back even though the row is newer — being older than the other
   * person's save is exactly what makes it a conflict copy, and dropping it
   * for that reason lost the work: nothing else holds it (a draft has no
   * browser copy at all until now).
   */
  conflict?: boolean;
}

export function useLocalBackup<T>(
  key: string | null,
  /**
   * When the row was last saved. A backup older than that describes a
   * version the document has since moved past — someone pressed Update after
   * it, here or elsewhere — and restoring it would quietly overwrite the newer
   * one (the conflict check cannot see it: the editor loaded the current row).
   * Such a backup is dropped rather than offered.
   */
  rowUpdatedAt?: Date | string | null
) {
  const rowTime = rowUpdatedAt ? new Date(rowUpdatedAt).getTime() : NaN;
  const [pending, setPending] = useState<Backup<T> | null>(null);
  const keyRef = useRef(key);
  keyRef.current = key;

  // Read once on mount. Anything unparsable is treated as absent.
  useEffect(() => {
    if (!key) return;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as Backup<T>;
        if (parsed && typeof parsed.at === "number" && parsed.data) {
          if (!parsed.conflict && Number.isFinite(rowTime) && parsed.at <= rowTime) localStorage.removeItem(key);
          else setPending(parsed);
        }
      }
    } catch {
      // Nothing to restore.
    }
  }, [key, rowTime]);

  const write = useCallback((data: T) => {
    if (!keyRef.current) return;
    try {
      localStorage.setItem(keyRef.current, JSON.stringify({ at: Date.now(), data } satisfies Backup<T>));
    } catch {
      // Storage full or blocked: the amber "unsaved" dot still shows.
    }
  }, []);

  /** Keeps the version a refused save carried; see `Backup.conflict`. */
  const writeConflict = useCallback((data: T) => {
    if (!keyRef.current) return;
    try {
      localStorage.setItem(keyRef.current, JSON.stringify({ at: Date.now(), data, conflict: true } satisfies Backup<T>));
    } catch {
      // Storage full or blocked: nothing more can be done from here.
    }
  }, []);

  const clear = useCallback(() => {
    setPending(null);
    if (!keyRef.current) return;
    try { localStorage.removeItem(keyRef.current); } catch {}
  }, []);

  return { pending, write, writeConflict, clear };
}

/** "10:42" / "yesterday 10:42" for the restore prompt. */
export function backupTime(at: number): string {
  const d = new Date(at);
  const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const today = new Date().toDateString() === d.toDateString();
  return today ? time : `${d.toLocaleDateString()} ${time}`;
}
