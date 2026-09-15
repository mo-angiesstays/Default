import { getCurrentUser } from "@/lib/auth";
import { TasksView } from "./TasksView";

export const dynamic = "force-dynamic";

export default async function TasksPage() {
  const user = await getCurrentUser();
  return <TasksView role={user!.role} />;
}
