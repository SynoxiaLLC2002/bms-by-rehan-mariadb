// node --experimental-strip-types scripts/check-cron-merge.mts
import assert from "node:assert/strict";
import { mergeCrontab } from "../src/lib/crontabMerge.ts";

const other = '*/5 * * * * curl -s "https://example.com/api/cron/publish" # BMS:example.com:publish';
const old = '*/3 * * * * curl -s "https://a.com/api/cron/publish" # BMS:a.com:publish';
const mine = '*/3 * * * * curl -s -H "Authorization: Bearer x" "https://a.com/api/cron/publish" # BMS:a.com:publish';
const manual = "0 4 * * * /usr/local/bin/cleanup.sh";

// replaces only this host's line, keeps the others, no duplicates on a second run
const once = mergeCrontab([manual, other, old].join("\n") + "\n", "a.com", [mine]);
assert.equal(once, [manual, other, mine].join("\n") + "\n");
assert.equal(mergeCrontab(once, "a.com", [mine]), once);
// empty table
assert.equal(mergeCrontab("", "a.com", [mine]), mine + "\n");
console.log("cron merge ok");
