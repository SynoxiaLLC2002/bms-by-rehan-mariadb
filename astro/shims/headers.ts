// next/headers: the public pages read no request headers or cookies here.
export async function headers(): Promise<Headers> { return new Headers(); }
export async function cookies() { return { get: (_n: string) => undefined, getAll: () => [], has: (_n: string) => false }; }
export async function draftMode() { return { isEnabled: false }; }
