import { forbidden, handler, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { isChannelMember } from "@/lib/chat";
import { notifyUsers } from "@/lib/notifications";
import { sendMessageSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;

  if (!(await isChannelMember(id, viewer.id))) {
    throw forbidden("You're not in that conversation");
  }

  const params = new URL(request.url).searchParams;
  const after = params.get("after");
  const limit = Math.min(Number(params.get("limit") ?? 100), 200);

  const messages = await prisma.chatMessage.findMany({
    where: {
      channelId: id,
      ...(after ? { createdAt: { gt: new Date(after) } } : {}),
    },
    orderBy: { createdAt: after ? "asc" : "desc" },
    take: limit,
    include: { user: { select: { id: true, name: true, avatarColor: true, role: true } } },
  });

  // Newest-first is only a paging convenience; render order is oldest-first.
  if (!after) messages.reverse();

  return ok({ messages });
});

export const POST = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  const input = await parseBody(request, sendMessageSchema);

  if (!(await isChannelMember(id, viewer.id))) {
    throw forbidden("You're not in that conversation");
  }

  const message = await prisma.chatMessage.create({
    data: {
      channelId: id,
      userId: viewer.id,
      body: input.body,
      attachments: input.attachments,
    },
    include: { user: { select: { id: true, name: true, avatarColor: true, role: true } } },
  });

  await prisma.$transaction([
    prisma.chatChannel.update({
      where: { id },
      data: { lastMessageAt: message.createdAt },
    }),
    // The sender has by definition read their own message.
    prisma.channelMember.update({
      where: { channelId_userId: { channelId: id, userId: viewer.id } },
      data: { lastReadAt: message.createdAt },
    }),
  ]);

  const others = await prisma.channelMember.findMany({
    where: { channelId: id, userId: { not: viewer.id }, muted: false },
    select: { userId: true },
  });
  const channel = await prisma.chatChannel.findUnique({
    where: { id },
    select: { name: true, type: true },
  });

  await notifyUsers(
    others.map((o) => o.userId),
    {
      title: `${viewer.name}${channel?.type === "DIRECT" ? "" : ` in ${channel?.name ?? "chat"}`}`,
      body: input.body.slice(0, 140),
      link: `/chat?channel=${id}`,
      kind: "chat",
    },
  );

  return ok({ message }, 201);
});
