// next/cache: nothing to revalidate in Astro; cached functions just run.
export function unstable_cache<T extends (...a: never[]) => unknown>(fn: T): T { return fn; }
export function revalidateTag(_t: string) {}
export function revalidatePath(_p: string) {}
export function unstable_noStore() {}
