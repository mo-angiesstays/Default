import { handler, ok, requireJobAccess } from "@/lib/api";
import { runCalendarSync } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Pushes every scheduled task to Google Calendar as an invite. */
export const POST = handler(async (request: Request) => {
  await requireJobAccess(request);
  const summary = await runCalendarSync();
  return ok({ summary });
});
