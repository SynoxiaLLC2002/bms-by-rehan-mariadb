// next/navigation on a page rendered by Astro: the throwing helpers become
// errors the route turns into the right response.
export class HttpRedirect extends Error {
  constructor(public location: string, public status: number) { super(`redirect ${status} ${location}`); }
}
export class HttpNotFound extends Error {
  constructor() { super("not found"); }
}
export function notFound(): never { throw new HttpNotFound(); }
export function redirect(url: string): never { throw new HttpRedirect(url, 307); }
export function permanentRedirect(url: string): never { throw new HttpRedirect(url, 308); }
export function usePathname(): string { return ""; }
export function useSearchParams(): URLSearchParams { return new URLSearchParams(); }
export function useRouter() { return { push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} }; }
