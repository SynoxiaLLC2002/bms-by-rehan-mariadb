// Writes the site's two cron jobs (publish every 15 minutes, backup once a day)
// into the hosting account's own crontab, so the owner does not have to copy
// lines into cPanel → Cron Jobs by hand.
//
// The app runs as the cPanel user, so `crontab -` edits exactly the table cPanel
// shows. Some hosts (CloudLinux/CageFS) hide the crontab binary from the app;
// then every call here throws and the Speed screen falls back to the lines.
//
// Each line ends in a shell comment naming this site, so a second click replaces
// our lines instead of adding duplicates, and other sites' jobs in the same
// account are left alone. Tokens go in an Authorization header, never the URL,
// so they stay out of the host's access logs.

import { execFile, spawn } from "node:child_process";
import { cronSecret } from "@/lib/secretCompare";
import { mergeCrontab } from "@/lib/crontabMerge";

export type CronJobId = "publish" | "backup";
export interface CronJob { id: CronJobId; label: string; line: string }

const MIN_TOKEN = 16;
const tag = (host: string, id: CronJobId) => `# BMS:${host}:${id}`;

export function cronJobs(origin: string): { jobs: CronJob[]; missing: string[] } {
  const host = new URL(origin).host;
  const jobs: CronJob[] = [];
  const missing: string[] = [];
  const publish = cronSecret();
  const backup = (process.env.BACKUP_TOKEN ?? "").trim();
  if (publish.length >= MIN_TOKEN) {
    // Not */3: that never let Neon's database sleep and used up its compute quota (INCIDENT-2026-10-21.md).
    jobs.push({ id: "publish", label: "Publish scheduled posts and keep the site awake (every 15 minutes)",
      line: `*/15 * * * * curl -s -o /dev/null -m 30 -H "Authorization: Bearer ${publish}" "${origin}/api/cron/publish" ${tag(host, "publish")}` });
  } else missing.push("CRON_TOKEN");
  if (backup.length >= MIN_TOKEN) {
    jobs.push({ id: "backup", label: "Daily backup (03:00)",
      line: `0 3 * * * curl -s -o /dev/null -m 300 -H "Authorization: Bearer ${backup}" "${origin}/api/backup" ${tag(host, "backup")}` });
  } else missing.push("BACKUP_TOKEN");
  return { jobs, missing };
}

function readCrontab(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("crontab", ["-l"], { timeout: 10_000 }, (err, stdout, stderr) => {
      if (!err) return resolve(stdout);
      // An account that never had a cron answers "no crontab for <user>" with exit 1.
      if (/no crontab/i.test(String(stderr))) return resolve("");
      reject(new Error(String(stderr || err.message).trim() || "crontab is not available"));
    });
  });
}

function writeCrontab(text: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("crontab", ["-"], { timeout: 10_000 });
    let stderr = "";
    p.stderr.on("data", (d) => (stderr += d));
    p.on("error", (e) => reject(new Error(e.message)));
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(stderr.trim() || `crontab exited with ${code}`))));
    p.stdin.end(text);
  });
}

/** Which of this site's jobs are already in the crontab. Throws when crontab cannot be read. */
export async function installedJobs(origin: string): Promise<CronJobId[]> {
  const host = new URL(origin).host;
  const table = await readCrontab();
  return (["publish", "backup"] as CronJobId[]).filter((id) => table.includes(tag(host, id)));
}

/** Replace this site's lines with the current ones; leaves every other line untouched. */
export async function installJobs(origin: string): Promise<CronJobId[]> {
  const host = new URL(origin).host;
  const { jobs } = cronJobs(origin);
  if (!jobs.length) throw new Error("Set CRON_TOKEN and BACKUP_TOKEN (16+ characters) in the app's environment first.");
  await writeCrontab(mergeCrontab(await readCrontab(), host, jobs.map((j) => j.line)));
  const now = await installedJobs(origin);
  if (now.length !== jobs.length) throw new Error("The crontab was written but the new lines did not stick.");
  return now;
}
