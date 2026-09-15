import { handler, ok, parseBody, requireManager, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { schedulingRuleSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  await requireUser();
  const params = new URL(request.url).searchParams;
  const propertyId = params.get("propertyId");

  const rules = await prisma.schedulingRule.findMany({
    where: {
      ...(propertyId ? { OR: [{ propertyId }, { propertyId: null }] } : {}),
      ...(params.get("includeInactive") === "true" ? {} : { active: true }),
    },
    orderBy: [{ hard: "desc" }, { weight: "desc" }, { createdAt: "asc" }],
    include: { property: { select: { id: true, name: true } } },
  });

  return ok({ rules });
});

export const POST = handler(async (request: Request) => {
  await requireManager();
  const input = await parseBody(request, schedulingRuleSchema);

  const rule = await prisma.schedulingRule.create({
    data: {
      name: input.name,
      instruction: input.instruction,
      kind: input.kind,
      propertyId: input.propertyId || null,
      taskTypes: input.taskTypes,
      hard: input.hard,
      weight: input.weight,
      active: input.active,
      config: (input.config ?? undefined) as object | undefined,
    },
  });

  return ok({ rule }, 201);
});
