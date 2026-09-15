import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Server-side guard for manager-only screens. The sidebar already hides these,
 * but a typed URL shouldn't render a shell that then fails every API call.
 */
export async function ManagerOnly({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.role !== "MANAGER") redirect("/");
  return <>{children}</>;
}
