// The client components whose browser side is scripts/vanilla.ts instead of
// React, by island id (lib/render.ts). One list for the server, which marks
// them <bms-island data-v>, and for the script, which brings them to life.
export const VANILLA = {
  offCanvas: ["frontend/OffCanvas#default"],
  accordion: ["frontend/blocks/AccordionFE#default", "frontend/blocks/lazy#AccordionFE"],
} as const;

export const VANILLA_IDS: ReadonlySet<string> = new Set(Object.values(VANILLA).flat());
