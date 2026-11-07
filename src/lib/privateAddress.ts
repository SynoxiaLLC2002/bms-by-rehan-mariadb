// Whether an IP address belongs to a private, local or otherwise non-public
// network — for anything that fetches a URL someone else chose.
//
// Checking the hostname text is not enough: `127.0.0.1.nip.io` and
// `localtest.me` are public names that resolve to loopback, and IPv6 can spell
// an IPv4 address several ways (`[::ffff:127.0.0.1]`, which the URL parser
// turns into `[::ffff:7f00:1]`; NAT64 `64:ff9b::…`; 6to4 `2002:…`). The
// caller resolves the name and asks here about every address it got.

function v4Private(a: number, b: number): boolean {
  return (
    a === 0 || // "this network"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) || // link-local, incl. cloud metadata
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) || // IETF protocol assignments (192.0.0/24) and TEST-NET-1 (192.0.2/24)
    (a === 198 && (b === 18 || b === 19)) || // benchmarking
    a >= 224 // multicast, reserved, broadcast
  );
}

function parseV4(ip: string): number[] | null {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return null;
  const parts = m.slice(1).map(Number);
  return parts.every((n) => n <= 255) ? parts : null;
}

/** The eight 16-bit words of an IPv6 address, or null if it is not one. */
function parseV6(raw: string): number[] | null {
  let ip = raw.replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  // A trailing dotted quad (`::ffff:1.2.3.4`) becomes two words.
  const tail = ip.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (tail) {
    const v4 = parseV4(tail[2]);
    if (!v4) return null;
    ip = `${tail[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = ip.split("::");
  if (halves.length > 2) return null;
  const words = (s: string) => (s ? s.split(":") : []);
  const head = words(halves[0]);
  const rest = halves.length === 2 ? words(halves[1]) : [];
  const fill = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill("0"), ...rest];
  const out = all.map((w) => (/^[0-9a-f]{1,4}$/.test(w) ? parseInt(w, 16) : NaN));
  return out.length === 8 && out.every((n) => Number.isFinite(n)) ? out : null;
}

export function isPrivateAddress(ip: string): boolean {
  const v4 = parseV4(ip);
  if (v4) return v4Private(v4[0], v4[1]);
  const w = parseV6(ip);
  if (!w) return true; // Not an address we understand: do not fetch it.
  const embedded = (hi: number) => v4Private(hi >> 8, hi & 0xff);
  if (w.slice(0, 7).every((n) => n === 0) && w[7] <= 1) return true; // :: and ::1
  if (w.slice(0, 5).every((n) => n === 0) && w[5] === 0xffff) return embedded(w[6]); // IPv4-mapped
  if (w.slice(0, 6).every((n) => n === 0)) return embedded(w[6]); // IPv4-compatible (deprecated)
  if (w[0] === 0x64 && w[1] === 0xff9b) return embedded(w[6]); // NAT64
  if (w[0] === 0x2002) return embedded(w[1]); // 6to4
  if ((w[0] & 0xfe00) === 0xfc00) return true; // unique-local
  if ((w[0] & 0xffc0) === 0xfe80) return true; // link-local
  if ((w[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}
