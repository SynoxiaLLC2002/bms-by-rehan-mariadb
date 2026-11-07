import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { SessionProvider } from "next-auth/react";

// The Customizer runs full-screen — no admin sidebar, like the WordPress customizer.
export default async function CustomizerLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/admin/login");

  return <SessionProvider session={session}>{children}</SessionProvider>;
}
