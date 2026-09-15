import { handler, ok, requireJobAccess } from "@/lib/api";
import { env } from "@/lib/env";
import { runCalendarSync } from "@/lib/integrations/google-calendar";
import { runDeepCleanGeneration } from "@/lib/jobs/deep-clean";
import { runHostawaySync } from "@/lib/jobs/hostaway-sync";
import { runAutoScheduler } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

type StepResult = { step: string; ok: boolean; result?: unknown; error?: string };

/**
 * The whole nightly pipeline, in order:
 *   Hostaway → deep cleans → auto-assign → Google Calendar
 *
 * Each step is independent: one failing integration doesn't stop the rest, and
 * the response says exactly which ones ran. Drive it with any scheduler using
 * `Authorization: Bearer $CRON_SECRET`.
 */
export const POST = handler(async (request: Request) => {
  await requireJobAccess(request);

  const steps: StepResult[] = [];

  const run = async (step: string, fn: () => Promise<unknown>, enabled = true) => {
    if (!enabled) {
      steps.push({ step, ok: true, result: "skipped — integration not configured" });
      return;
    }
    try {
      steps.push({ step, ok: true, result: await fn() });
    } catch (error) {
      steps.push({
        step,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  // Import listings first so a property added in Hostaway today gets its
  // turnovers tonight, rather than waiting for someone to press a button.
  await run(
    "hostaway-sync",
    () => runHostawaySync({ importListingsFirst: true }),
    env.hostaway.enabled,
  );
  await run("deep-clean-generation", () => runDeepCleanGeneration());
  await run("auto-scheduler", () => runAutoScheduler({ daysAhead: 14 }));
  await run("calendar-sync", () => runCalendarSync(), env.google.enabled);

  return ok({ steps, allOk: steps.every((step) => step.ok) });
});

/** GET is allowed so a plain cron service can hit the URL with ?key=… */
export const GET = POST;
