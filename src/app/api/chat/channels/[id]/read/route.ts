import { forbidden, handler, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isChannelMember } from "@/lib/chat";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const POST = handler(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;

  if (!(await isChannelMember(id, viewer.id))) {
    throw forbidden("You're not in that conversation");
  }

  await prisma.channelMember.update({
    where: { channelId_userId: { channelId: id, userId: viewer.id } },
    data: { lastReadAt: new Date() },
  });

  return ok({ ok: true });
});
