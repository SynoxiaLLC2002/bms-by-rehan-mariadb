import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { notFound } from "next/navigation";
import Header from "@/components/admin/Header";
import AuthorPageEditor from "@/components/admin/AuthorPageEditor";
import { auth } from "@/lib/auth";
import { canManageUser } from "@/lib/authz";

export default async function AuthorPageEditorRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Same rule as the profile screen and `/api/users/[id]`.
  if (!canManageUser(await auth(), id)) notFound();
  const user = await db.query.users.findFirst({
    where: eq(users.id, id),
    columns: { id: true, name: true, content: true },
  });
  if (!user) notFound();

  return (
    <>
      <Header title="Author Page" />
      <AuthorPageEditor userId={user.id} userName={user.name} initialContent={user.content} />
    </>
  );
}
