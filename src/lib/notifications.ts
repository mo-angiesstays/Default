import { prisma } from "@/lib/db";

export type NotificationInput = {
  title: string;
  body?: string | null;
  link?: string | null;
  kind?: string;
};

export async function notifyUsers(userIds: string[], input: NotificationInput): Promise<void> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (!unique.length) return;

  await prisma.notification.createMany({
    data: unique.map((userId) => ({
      userId,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      kind: input.kind ?? "info",
    })),
  });
}

export async function notifyManagers(input: NotificationInput): Promise<void> {
  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { id: true },
  });
  await notifyUsers(
    managers.map((m) => m.id),
    input,
  );
}
