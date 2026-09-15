import { handler, ok, parseBody, requireManager } from "@/lib/api";
import { prisma } from "@/lib/db";
import { updateSchedulingRuleSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const PATCH = handler(async (request: Request, context: Context) => {
  await requireManager();
  const { id } = await context.params;
  const input = await parseBody(request, updateSchedulingRuleSchema);

  const data: Record<string, unknown> = {};
  for (const key of ["name", "instruction", "kind", "taskTypes", "hard", "weight", "active"] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (input.propertyId !== undefined) data.propertyId = input.propertyId || null;
  if (input.config !== undefined) data.config = (input.config ?? undefined) as object | undefined;

  const rule = await prisma.schedulingRule.update({ where: { id }, data });
  return ok({ rule });
});

export const DELETE = handler(async (_request: Request, context: Context) => {
  await requireManager();
  const { id } = await context.params;
  await prisma.schedulingRule.delete({ where: { id } });
  return ok({ ok: true });
});
