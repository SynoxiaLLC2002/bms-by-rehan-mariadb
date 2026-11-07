// The secret every signed token in this CMS is signed with.
//
// `loginProof` and `passwordReset` each had their own copy of this reader.
// Four identical lines are easy to keep in step until one of them learns
// about a new environment variable and the other does not — and the failure
// then is a token this process signs and cannot verify.

export function authSecret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET ?? "";
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}
