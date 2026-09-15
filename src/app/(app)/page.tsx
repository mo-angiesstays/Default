import { getCurrentUser } from "@/lib/auth";
import { DashboardView } from "./DashboardView";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getCurrentUser();
  return <DashboardView role={user!.role} name={user!.name} />;
}
