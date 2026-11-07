import { redirect } from "next/navigation";

// Appearance now lives entirely in the Customizer — one place, with a live preview.
// Kept as a redirect so old links and bookmarks still land somewhere sensible.
export default function AppearanceRedirect() {
  redirect("/admin/customize");
}
