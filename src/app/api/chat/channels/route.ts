import { handler, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getOrCreateDirectChannel, getOrCreatePropertyChannel } from "@/lib/chat";
import { createChannelSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const viewer = await requireUser();

  const memberships = await prisma.channelMember.findMany({
    where: { userId: viewer.id },
    include: {
      channel: {
        include: {
          property: { select: { id: true, name: true, color: true } },
          task: { select: { id: true, title: true } },
          members: {
            include: { user: { select: { id: true, name: true, avatarColor: true, role: true } } },
          },
          messages: { orderBy: { createdAt: "desc" }, take: 1 },
        },
      },
    },
  });

  const channels = await Promise.all(
    memberships
      .filter((m) => !m.channel.archived)
      .map(async (membership) => {
        const unread = await prisma.chatMessage.count({
          where: {
            channelId: membership.channelId,
            userId: { not: viewer.id },
            createdAt: membership.lastReadAt ? { gt: membership.lastReadAt } : undefined,
          },
        });

        const channel = membership.channel;
        // A DM shows the other person's name rather than a stored title.
        const other =
          channel.type === "DIRECT"
            ? channel.members.find((m) => m.userId !== viewer.id)?.user
            : null;

        return {
          id: channel.id,
          type: channel.type,
          name: other?.name ?? channel.name ?? "Conversation",
          color: other?.avatarColor ?? channel.property?.color ?? null,
          propertyId: channel.propertyId,
          taskId: channel.taskId,
          lastMessage: channel.messages[0] ?? null,
          lastMessageAt: channel.lastMessageAt,
          memberCount: channel.members.length,
          members: channel.members.map((m) => m.user),
          unread,
          muted: membership.muted,
        };
      }),
  );

  channels.sort(
    (a, b) => (b.lastMessageAt?.getTime() ?? 0) - (a.lastMessageAt?.getTime() ?? 0),
  );

  return ok({ channels });
});

export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, createChannelSchema);

  if (input.type === "DIRECT") {
    const other = input.memberIds.find((id) => id !== viewer.id);
    if (!other) throw new Error("A direct message needs somebody to talk to");
    const channel = await getOrCreateDirectChannel(viewer.id, other);
    return ok({ channel }, 201);
  }

  if (input.type === "PROPERTY" && input.propertyId) {
    const channel = await getOrCreatePropertyChannel(input.propertyId);
    // Whoever opens it joins it.
    await prisma.channelMember.createMany({
      data: [{ channelId: channel.id, userId: viewer.id }],
      skipDuplicates: true,
    });
    return ok({ channel }, 201);
  }

  const memberIds = [...new Set([viewer.id, ...input.memberIds])];
  const channel = await prisma.chatChannel.create({
    data: {
      type: input.type,
      name: input.name ?? "New conversation",
      propertyId: input.propertyId ?? null,
      createdById: viewer.id,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });

  return ok({ channel }, 201);
});
