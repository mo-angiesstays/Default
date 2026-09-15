import { z } from "zod";
import { handler, ok, parseBody, requireManager } from "@/lib/api";
import { applyAssignment, proposeAssignment } from "@/lib/scheduler";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const schema = z.object({
  taskId: z.string().min(1),
  /** Write the result straight away instead of just previewing it. */
  apply: z.boolean().default(false),
});

/** Asks the scheduler who should take one task, with its reasoning. */
export const POST = handler(async (request: Request) => {
  await requireManager();
  const { taskId, apply } = await parseBody(request, schema);

  const proposal = await proposeAssignment(taskId);
  let applied = false;
  if (apply) applied = await applyAssignment(proposal, { auto: false });

  return ok({ proposal, applied });
});
