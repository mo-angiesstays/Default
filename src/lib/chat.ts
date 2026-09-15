import { prisma } from "@/lib/db";

/** Stable key for a two-person channel, so a DM is never duplicated. */
export function dmKeyFor(a: string, b: string): string {
  return `dm:${[a, b].sort().join(":")}`;
}

export async function getOrCreateDirectChannel(userA: string, userB: string) {
  const dmKey = dmKeyFor(userA, userB);
  const existing = await prisma.chatChannel.findUnique({ where: { dmKey } });
  if (existing) return existing;

  return prisma.chatChannel.create({
    data: {
      type: "DIRECT",
      dmKey,
      createdById: userA,
      members: { create: [{ userId: userA }, { userId: userB }] },
    },
  });
}

/** Channel for a property, with every manager plus anyone assigned to it. */
export async function getOrCreatePropertyChannel(propertyId: string) {
  const existing = await prisma.chatChannel.findFirst({
    where: { type: "PROPERTY", propertyId },
  });
  if (existing) return existing;

  const property = await prisma.property.findUniqueOrThrow({
    where: { id: propertyId },
    select: { name: true, assignments: { select: { userId: true } } },
  });
  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { id: true },
  });

  const memberIds = [
    ...new Set([...managers.map((m) => m.id), ...property.assignments.map((a) => a.userId)]),
  ];

  return prisma.chatChannel.create({
    data: {
      type: "PROPERTY",
      propertyId,
      name: property.name,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
}

/** Per-task thread: the assignee and the managers. */
export async function getOrCreateTaskChannel(taskId: string) {
  const existing = await prisma.chatChannel.findUnique({ where: { taskId } });
  if (existing) return existing;

  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { title: true, assigneeId: true, createdById: true },
  });
  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { id: true },
  });

  const memberIds = [
    ...new Set(
      [...managers.map((m) => m.id), task.assigneeId, task.createdById].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];

  return prisma.chatChannel.create({
    data: {
      type: "TASK",
      taskId,
      name: task.title,
      members: { create: memberIds.map((userId) => ({ userId })) },
    },
  });
}

/** Posts an unauthored notice into a channel (task assigned, issue raised…). */
export async function postSystemMessage(channelId: string, body: string) {
  const message = await prisma.chatMessage.create({
    data: { channelId, body, system: true },
  });
  await prisma.chatChannel.update({
    where: { id: channelId },
    data: { lastMessageAt: message.createdAt },
  });
  return message;
}

export async function isChannelMember(channelId: string, userId: string): Promise<boolean> {
  const member = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
    select: { id: true },
  });
  return Boolean(member);
}

/** Adds members, ignoring anyone already in the channel. */
export async function ensureMembers(channelId: string, userIds: string[]): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;
  await prisma.channelMember.createMany({
    data: unique.map((userId) => ({ channelId, userId })),
    skipDuplicates: true,
  });
}

export async function unreadCountFor(userId: string): Promise<number> {
  const memberships = await prisma.channelMember.findMany({
    where: { userId, muted: false },
    select: { channelId: true, lastReadAt: true },
  });
  if (!memberships.length) return 0;

  let total = 0;
  for (const membership of memberships) {
    total += await prisma.chatMessage.count({
      where: {
        channelId: membership.channelId,
        userId: { not: userId },
        createdAt: membership.lastReadAt ? { gt: membership.lastReadAt } : undefined,
      },
    });
  }
  return total;
}
