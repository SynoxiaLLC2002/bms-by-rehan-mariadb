// Small checks for the 1.9.48 audit leftovers: who we believe is calling,
// and when a save is allowed to touch the public cache.
//
//   npm run check:audit

import { clientIp } from "../src/lib/rateLimit.ts";
import { isLiveNow } from "../src/lib/publishState.ts";

function req(map: Record<string, string>) {
  return {
    headers: { get: (name: string) => map[name.toLowerCase()] ?? map[name] ?? null },
  };
}

function publicChanged(
  before: { status?: string | null; publishedAt?: Date | null; deletedAt?: Date | null } | null,
  after: { status?: string | null; publishedAt?: Date | null; deletedAt?: Date | null } | null
) {
  const live = (s: typeof before) => !!s && isLiveNow(s.status, s.publishedAt, s.deletedAt);
  return live(before) || live(after);
}

let failed = 0;
function ok(name: string, cond: boolean, detail = "") {
  if (cond) console.log("ok   ", name);
  else {
    failed += 1;
    console.log("FAIL ", name, detail);
  }
}

ok(
  "cf-connecting-ip wins over a fake x-forwarded-for",
  clientIp(req({ "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "1.2.3.4, 203.0.113.9" })) === "203.0.113.9"
);
ok(
  "without Cloudflare, last x-forwarded-for hop is used",
  clientIp(req({ "x-forwarded-for": "1.2.3.4, 198.51.100.7" })) === "198.51.100.7"
);
ok("no address at all is unknown", clientIp(req({})) === "unknown");
ok(
  "true-client-ip is used when Cloudflare's header is absent",
  clientIp(req({ "true-client-ip": "198.51.100.2", "x-forwarded-for": "1.2.3.4" })) === "198.51.100.2"
);

ok("draft then draft does not change the public site", !publicChanged({ status: "draft" }, { status: "draft" }));
ok("publishing a draft does", publicChanged({ status: "draft" }, { status: "published" }));
ok("editing a live post does", publicChanged({ status: "published" }, { status: "published" }));
ok("trashing a live post does", publicChanged({ status: "published" }, { status: "published", deletedAt: new Date() }));

if (failed) {
  console.error(`\n${failed} check(s) failed`);
  process.exit(1);
}
console.log("\n0 failed");
