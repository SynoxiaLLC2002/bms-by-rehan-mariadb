// The 404 for an author slug that does not exist.
//
// This route group has its own root layout (see layout.tsx), so the site's
// `not-found.tsx` under `(site)/[lang]` does not reach it: a `notFound()`
// thrown here bubbled to Next's built-in error shell — `<html
// id="__next_error__">` with an empty body — and the visitor saw a blank
// page with no header, no search and no way back. Same page as the site's,
// so the two 404s are one 404.

export { default, generateMetadata } from "@/app/(site)/[lang]/not-found";
