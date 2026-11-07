// The password rule, in one place and on the server.
//
// The forms already promise it — `minLength={8}` on the create-user and
// edit-user inputs — but `minLength` is an HTML hint that vanishes the moment
// anyone posts to the API directly. `/api/setup`, `/api/users` and
// `/api/users/[id]` all hashed whatever they were handed, so a one-character
// password was accepted everywhere. `/api/setup` is unauthenticated, so on a
// fresh install that was reachable by anyone who found the site first.
//
// Enforcing what the UI already claims, so nothing legitimate changes.

/** What the forms say, so the server and the browser agree. */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * An upper bound, because bcrypt hashing is deliberately slow and the setup
 * route is public: without one, a megabyte "password" is free CPU to burn.
 * (bcrypt only reads the first 72 bytes anyway, so this costs nobody anything.)
 */
export const MAX_PASSWORD_LENGTH = 200;

/**
 * The reason this password is unacceptable, or null when it is fine.
 *
 * Returns the message rather than a boolean so every caller reports the same
 * thing and the person on the other end learns what to change.
 */
export function passwordProblem(value: unknown): string | null {
  if (typeof value !== "string" || value.length === 0) {
    return "A password is required.";
  }
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Password must be ${MAX_PASSWORD_LENGTH} characters or fewer.`;
  }
  // bcrypt reads the first 72 bytes and ignores the rest without a word. A
  // 40-letter Arabic passphrase is about 80 bytes, so its tail protected
  // nothing; better to say so than to store a weaker password than typed.
  if (new TextEncoder().encode(value).length > BCRYPT_MAX_BYTES) {
    return "Password is too long to be used in full (72 bytes — about 70 Latin letters, or 36 in Arabic or Urdu). Use a shorter one.";
  }
  if (weak(value)) {
    return "That password is too easy to guess. Avoid common passwords, repeated characters and simple sequences like 12345678.";
  }
  return null;
}

/** bcrypt's input limit, in UTF-8 bytes. */
const BCRYPT_MAX_BYTES = 72;

/**
 * The first guesses of every password-spraying list. Length alone let
 * "password1" and "12345678" through; this is not a full dictionary, only
 * the ones that fall in the first minute of any attack.
 */
const COMMON = new Set([
  "password", "password1", "password12", "password123", "passw0rd", "p@ssw0rd", "p@ssword",
  "12345678", "123456789", "1234567890", "87654321", "11111111", "00000000", "12341234",
  "qwertyui", "qwerty123", "qwertyuiop", "1q2w3e4r", "1qaz2wsx", "zaq12wsx", "asdfghjk",
  "iloveyou", "iloveyou1", "sunshine", "princess", "football", "baseball", "welcome1",
  "welcome123", "admin123", "administrator", "letmein1", "trustno1", "abc12345", "abcd1234",
  "aa123456", "changeme", "monkey123", "dragon123", "superman", "starwars", "whatever",
  "computer", "internet", "michael1", "master123", "qazwsxedc", "q1w2e3r4", "admin1234",
]);

function weak(value: string): boolean {
  const v = value.toLowerCase();
  if (COMMON.has(v)) return true;
  // One character repeated: "aaaaaaaa", "••••••••".
  if (new Set([...v]).size <= 2) return true;
  // A straight run up or down the character table: "12345678", "abcdefgh".
  const codes = [...v].map((c) => c.codePointAt(0) ?? 0);
  const step = codes[1] - codes[0];
  if (Math.abs(step) === 1 && codes.every((c, i) => i === 0 || c - codes[i - 1] === step)) return true;
  return false;
}

/**
 * An email address as it is stored and looked up, or null when it is not one.
 *
 * Lower-cased and trimmed, because the four places that touched emails did not
 * agree: setup and the Users screen stored whatever was typed, sign-in compared
 * it exactly, and the forgot-password route lower-cased before looking it up —
 * so an account created as `Name@Example.com` could sign in but never reset
 * its password. One rule, applied on the way in and on every lookup.
 */
export function normalizeEmail(value: unknown): string | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (s.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) return null;
  return s;
}
