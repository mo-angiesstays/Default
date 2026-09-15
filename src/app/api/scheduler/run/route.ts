import { z } from "zod";
import { handler, ok, parseBody, requireJobAccess } from "@/lib/api";
import { autoScheduleUnassigned, runAutoScheduler } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const schema = z.object({
  daysAhead: z.number().int().min(1).max(90).default(14),
  /** Preview without writing anything. */
  dryRun: z.boolean().default(false),
  taskIds: z.array(z.string()).optional(),
});

/** Fills every unassigned task in the window using the rules + AI. */
export const POST = handler(async (request: Request) => {
  await requireJobAccess(request);

  const body = await request
    .json()
    .catch(() => ({}));
  const input = schema.parse(body ?? {});

  const result =
    input.dryRun || input.taskIds?.length
      ? await autoScheduleUnassigned(input)
      : await runAutoScheduler({ daysAhead: input.daysAhead });

  return ok({ result });
});
