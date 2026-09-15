import { getCurrentUser } from "@/lib/auth";
import { CalendarView } from "./CalendarView";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const user = await getCurrentUser();
  return <CalendarView role={user!.role} />;
}
