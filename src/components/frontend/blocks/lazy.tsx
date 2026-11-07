"use client";

// The interactive blocks, each in a chunk of its own.
//
// These used to be `dynamic()` calls inside BlockRenderer and SiteLayout,
// both Server Components — and there `next/dynamic` does not split anything.
// A client component referenced from server code is added to the route's
// client entry whatever wraps it, so the client manifest listed Tabs, Slider,
// Modal, Lottie, the contact form, the image compare and the customizer's
// PreviewBridge on every public page, all in the shared chunks the header
// menu sits in: about 45 KB (compressed) of JavaScript for blocks the page
// did not contain. Measured on the first live site: a homepage with one
// accordion and one table of contents loaded the contact form's validation
// strings and the customizer's whole CSS builder.
//
// From a Client Component, `dynamic()` is a real `import()`: webpack gives
// each block its own chunk, the flight payload names only the ones the page
// renders, and those still server-render and hydrate without a flash (Next
// preloads a chunk it rendered on the server). Nothing else changes for the
// renderer — the same components, the same props.

import dynamic from "next/dynamic";

export const AccordionFE = dynamic(() => import("./AccordionFE"));
export const TableOfContentsFE = dynamic(() => import("./TableOfContentsFE"));
export const TabsFE = dynamic(() => import("./TabsFE"));
export const SliderFE = dynamic(() => import("./SliderFE"));
export const ModalFE = dynamic(() => import("./ModalFE"));
export const LottieFE = dynamic(() => import("./LottieFE"));
export const ShowMoreFE = dynamic(() => import("./ShowMoreFE"));
export const ImageCompareFE = dynamic(() => import("./ImageCompareFE"));
export const ContactFormFE = dynamic(() => import("./ContactFormFE"));

/** Only the customizer iframe mounts this; see SiteLayout. */
export const PreviewBridge = dynamic(() => import("../PreviewBridge"));
