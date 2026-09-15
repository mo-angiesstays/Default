import { z } from "zod";
import { handler, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async (request: Request) => {
  const viewer = await requireUser();
  const params = new URL(request.url).searchParams;

  const notifications = await prisma.notification.findMany({
    where: {
      userId: viewer.id,
      ...(params.get("unread") === "true" ? { readAt: null } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: Math.min(Number(params.get("limit") ?? 50), 200),
  });

  return ok({ notifications });
});

const markSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().default(false),
});

export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, markSchema);

  await prisma.notification.updateMany({
    where: {
      userId: viewer.id,
      readAt: null,
      ...(input.all ? {} : { id: { in: input.ids ?? [] } }),
    },
    data: { readAt: new Date() },
  });

  return ok({ ok: true });
});
