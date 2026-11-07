import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../globals.css";
import { getSiteSettings } from "@/lib/settings";
import { adminDir, adminLang } from "@/lib/locale";
import { databaseUrl } from "@/lib/db/pool";

const inter = Inter({ subsets: ["latin"] });

/**
 * Root layout for everything that is not the public site: the admin, the
 * customizer, and the preview routes it renders in an iframe.
 *
 * Separate from the site's root layout because the two answer a different
 * question. The site's `<html lang>` is the language of the *content* being
 * served; this one is the language of the *interface*, which is a per-user
 * choice and has nothing to do with which language a visitor is reading. They
 * were one setting once and flipping the site language flipped the admin with
 * it.
 */
export const metadata: Metadata = {
  title: "Admin",
  // The admin is never a search result.
  robots: { index: false, follow: false },
};

export default async function AdminRootLayout({ children }: { children: React.ReactNode }) {
  // No database yet = a brand-new site on its setup screen: nothing to read.
  const settings = databaseUrl() ? await getSiteSettings() : {};

  return (
    <html lang={adminLang(settings)} dir={adminDir(settings)}>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
