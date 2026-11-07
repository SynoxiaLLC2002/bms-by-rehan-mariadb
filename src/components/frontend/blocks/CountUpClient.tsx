"use client";

import dynamic from "next/dynamic";

// `ssr: false` isn't allowed from a Server Component, and BlockRenderer is one.
// The counter animates from zero, so server-rendering it would only produce
// markup the client immediately replaces.
export default dynamic(() => import("./CountUpFE"), { ssr: false });
