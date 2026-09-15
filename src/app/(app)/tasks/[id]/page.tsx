import { getCurrentUser } from "@/lib/auth";
import { TaskDetailView } from "./TaskDetailView";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  return <TaskDetailView taskId={id} viewer={user!} />;
}
