"use client";

import dynamic from "next/dynamic";

// Client-only for the same reason as CountUpClient: the remaining time differs
// between server render and hydration, which is a guaranteed mismatch.
export default dynamic(() => import("./CountdownFE"), { ssr: false });
