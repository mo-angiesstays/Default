import { handler, ok, parseBody, requireManager, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { checklistTemplateSchema, checklistTypeEnum } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  await requireUser();
  const params = new URL(request.url).searchParams;

  const type = checklistTypeEnum.safeParse(params.get("type"));
  const propertyId = params.get("propertyId");

  const templates = await prisma.checklistTemplate.findMany({
    where: {
      ...(type.success ? { type: type.data } : {}),
      ...(propertyId
        ? { OR: [{ propertyId }, { propertyId: null }] }
        : params.get("globalOnly") === "true"
          ? { propertyId: null }
          : {}),
      ...(params.get("includeInactive") === "true" ? {} : { active: true }),
    },
    orderBy: [{ type: "asc" }, { propertyId: "asc" }, { name: "asc" }],
    include: {
      property: { select: { id: true, name: true } },
      items: { orderBy: { position: "asc" } },
    },
  });

  return ok({ templates });
});

export const POST = handler(async (request: Request) => {
  await requireManager();
  const input = await parseBody(request, checklistTemplateSchema);

  const template = await prisma.checklistTemplate.create({
    data: {
      name: input.name,
      type: input.type,
      description: input.description ?? null,
      propertyId: input.propertyId || null,
      active: input.active,
      items: {
        create: input.items.map((item, index) => ({
          section: item.section,
          title: item.title,
          description: item.description ?? null,
          position: item.position ?? index,
          required: item.required,
          photoRequired: item.photoRequired,
        })),
      },
    },
    include: { items: { orderBy: { position: "asc" } } },
  });

  return ok({ template }, 201);
});
