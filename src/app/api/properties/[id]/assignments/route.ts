import { z } from "zod";
import { handler, ok, parseBody, requireManager } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  assignments: z
    .array(
      z.object({
        userId: z.string().min(1),
        priority: z.number().int().min(1).max(10).default(1),
        excluded: z.boolean().default(false),
      }),
    )
    .default([]),
});

/** Replaces the whole preference list for a property in one call. */
export const PUT = handler(async (request: Request, context: Context) => {
  await requireManager();
  const { id } = await context.params;
  const { assignments } = await parseBody(request, schema);

  await prisma.$transaction([
    prisma.propertyAssignment.deleteMany({ where: { propertyId: id } }),
    prisma.propertyAssignment.createMany({
      data: assignments.map((a) => ({ ...a, propertyId: id })),
      skipDuplicates: true,
    }),
  ]);

  const saved = await prisma.propertyAssignment.findMany({
    where: { propertyId: id },
    include: { user: { select: { id: true, name: true, role: true } } },
    orderBy: { priority: "asc" },
  });

  return ok({ assignments: saved });
});
