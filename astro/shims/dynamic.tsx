// next/dynamic on the server: the module, loaded lazily. Pages render to a
// stream, so React waits for it.
import { lazy, type ComponentType } from "react";

export default function dynamic<P>(loader: () => Promise<{ default: ComponentType<P> } | ComponentType<P>>): ComponentType<P> {
  return lazy(async () => {
    const m = await loader();
    return { default: ("default" in (m as object) ? (m as { default: ComponentType<P> }).default : m) as ComponentType<P> };
  }) as unknown as ComponentType<P>;
}
