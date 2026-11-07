// Self-check for lib/autoDatabase (no cPanel needed):
//   node --experimental-strip-types scripts/check-autodb.mts
import assert from "node:assert/strict";
import { baseName, createSiteDatabase, newPassword, pickName, type Run } from "../src/lib/autoDatabase.ts";

assert.equal(baseName("/home/x/clnet"), "clnet");
assert.equal(baseName("/home/x/My-Site_2"), "mysite2");
assert.equal(baseName("/home/x/---"), "bms");
assert.equal(pickName("acc_", "clnet", 47, new Set()), "acc_clnet");
assert.equal(pickName("acc_", "clnet", 47, new Set(["acc_clnet", "acc_clnet2"])), "acc_clnet3");
assert.equal(pickName("acc_", "verylongname", 10, new Set()), "acc_verylo");
assert.match(newPassword(), /^[A-Za-z0-9]{28}$/);

// A refusal halfway leaves nothing behind.
const calls: string[] = [];
const fake = (failAt: string): Run => async ([, fn, ...kv]) => {
  calls.push(fn + " " + kv.join(" "));
  const ok = (data: unknown = null) => JSON.stringify({ result: { status: 1, data } });
  if (fn === failAt) return JSON.stringify({ result: { status: 0, errors: ["refused for the test"] } });
  if (fn === "get_restrictions") return ok({ prefix: "acc_", max_database_name_length: 64, max_username_length: 47 });
  if (fn === "list_databases") return ok([{ database: "acc_clnet" }]);
  if (fn === "list_users") return ok([]);
  return ok();
};
await assert.rejects(createSiteDatabase("/home/acc/clnet", fake("set_privileges_on_database"), async () => true), /refused for the test/);
assert.ok(calls.includes("delete_user name=acc_clnet2") && calls.includes("delete_database name=acc_clnet2"), calls.join("\n"));
assert.ok(calls.some((c) => c.includes("privileges=ALL%20PRIVILEGES")), "privileges must be URI-encoded for uapi");

// Success: the first address that connects is returned.
calls.length = 0;
const url = await createSiteDatabase("/home/acc/clnet", fake(""), async (u) => u.includes("127.0.0.1"));
assert.match(url, /^mysql:\/\/acc_clnet2:[A-Za-z0-9]{28}@127\.0\.0\.1:3306\/acc_clnet2$/);
await assert.rejects(createSiteDatabase("/home/acc/clnet", fake(""), async () => false), /cannot connect/);

console.log("check-autodb: all passed");
