import { handler, notFound, ok, parseBody, requireManager, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { updateChecklistTemplateSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: Context) => {
  await requireUser();
  const { id } = await context.params;

  const template = await prisma.checklistTemplate.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, name: true } },
      items: { orderBy: { position: "asc" } },
    },
  });
  if (!template) throw notFound("No such checklist");

  return ok({ template });
});

/**
 * Saving a checklist replaces its item list wholesale. Tasks already created
 * hold their own snapshot of the items, so editing a template never rewrites
 * work that's already out with a cleaner.
 */
export const PATCH = handler(async (request: Request, context: Context) => {
  await requireManager();
  const { id } = await context.params;
  const input = await parseBody(request, updateChecklistTemplateSchema);

  const data: Record<string, unknown> = {};
  if (input.name !== undefined) data.name = input.name;
  if (input.type !== undefined) data.type = input.type;
  if (input.description !== undefined) data.description = input.description;
  if (input.active !== undefined) data.active = input.active;
  if (input.propertyId !== undefined) data.propertyId = input.propertyId || null;

  await prisma.$transaction(async (tx) => {
    await tx.checklistTemplate.update({ where: { id }, data });

    if (input.items) {
      await tx.checklistTemplateItem.deleteMany({ where: { templateId: id } });
      if (input.items.length) {
        await tx.checklistTemplateItem.createMany({
          data: input.items.map((item, index) => ({
            templateId: id,
            section: item.section,
            title: item.title,
            description: item.description ?? null,
            position: item.position ?? index,
            required: item.required,
            photoRequired: item.photoRequired,
          })),
        });
      }
    }
  });

  const template = await prisma.checklistTemplate.findUnique({
    where: { id },
    include: { items: { orderBy: { position: "asc" } } },
  });

  return ok({ template });
});

export const DELETE = handler(async (_request: Request, context: Context) => {
  await requireManager();
  const { id } = await context.params;
  await prisma.checklistTemplate.update({ where: { id }, data: { active: false } });
  return ok({ ok: true });
});
