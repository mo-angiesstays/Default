import { handler, ok, parseBody, requireManager, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { propertySchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  await requireUser();
  const params = new URL(request.url).searchParams;
  const includeInactive = params.get("includeInactive") === "true";

  const properties = await prisma.property.findMany({
    where: includeInactive ? {} : { active: true },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          tasks: { where: { status: { notIn: ["COMPLETED", "VERIFIED", "CANCELLED"] } } },
          issues: { where: { status: { not: "RESOLVED" } } },
        },
      },
    },
  });

  return ok({ properties });
});

export const POST = handler(async (request: Request) => {
  await requireManager();
  const input = await parseBody(request, propertySchema);

  const property = await prisma.property.create({
    data: { ...input, hostawayListingId: input.hostawayListingId || null },
  });
  return ok({ property }, 201);
});
