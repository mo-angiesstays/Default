import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { handler } from "@/lib/api";
import { unreadCountFor } from "@/lib/chat";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = handler(async () => {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ user: null }, { status: 200 });

  const [unreadChat, unreadNotifications, openShift] = await Promise.all([
    unreadCountFor(user.id),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    prisma.timeEntry.findFirst({
      where: { userId: user.id, clockOutAt: null },
      select: { id: true, clockInAt: true, taskId: true, propertyId: true },
    }),
  ]);

  return NextResponse.json({ user, unreadChat, unreadNotifications, openShift });
});
