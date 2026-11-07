/** The crontab with this host's old lines swapped for `lines`; every other line kept as it was. */
export function mergeCrontab(table: string, host: string, lines: string[]): string {
  const kept = table.split("\n").filter((l) => l.trim() && !l.includes(`# BMS:${host}:`));
  return [...kept, ...lines].join("\n") + "\n";
}
