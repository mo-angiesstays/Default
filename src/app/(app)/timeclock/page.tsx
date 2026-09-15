import { getCurrentUser } from "@/lib/auth";
import { TimeClockView } from "./TimeClockView";

export const dynamic = "force-dynamic";

export default async function TimeClockPage() {
  const user = await getCurrentUser();
  return <TimeClockView viewer={user!} />;
}
