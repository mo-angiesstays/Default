import { forbidden, handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { updateUserSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

export const GET = handler(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;

  const user = await prisma.user.findUnique({
    where: { id },
    include: {
      availability: { orderBy: [{ dayOfWeek: "asc" }, { startMin: "asc" }] },
      timeOff: { where: { endsAt: { gte: new Date() } }, orderBy: { startsAt: "asc" } },
      propertyAssignments: { include: { property: { select: { id: true, name: true } } } },
    },
  });
  if (!user) throw notFound("That person isn't in the team list");

  const { passwordHash, hourlyRate, ...rest } = user;
  return ok({
    user: {
      ...rest,
      // Only managers and the person themselves see the pay rate.
      hourlyRate:
        viewer.role === "MANAGER" || viewer.id === id ? (hourlyRate?.toString() ?? null) : undefined,
    },
  });
});

export const PATCH = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  const input = await parseBody(request, updateUserSchema);

  const isSelf = viewer.id === id;
  if (!isSelf && viewer.role !== "MANAGER") {
    throw forbidden("Only a manager can edit someone else's profile");
  }
  // Staff may edit their own details but never promote themselves.
  if (!isSelf || viewer.role !== "MANAGER") {
    if (input.role !== undefined || input.active !== undefined || input.hourlyRate !== undefined) {
      if (viewer.role !== "MANAGER") throw forbidden("Only a manager can change role, status or pay");
    }
  }

  const data: Record<string, unknown> = {};
  for (const key of [
    "name",
    "phone",
    "timezone",
    "skills",
    "maxDailyTasks",
    "avatarColor",
    "notes",
  ] as const) {
    if (input[key] !== undefined) data[key] = input[key];
  }
  if (viewer.role === "MANAGER") {
    if (input.role !== undefined) data.role = input.role;
    if (input.active !== undefined) data.active = input.active;
    if (input.hourlyRate !== undefined) data.hourlyRate = input.hourlyRate;
    if (input.email !== undefined) data.email = input.email.toLowerCase().trim();
  }
  if (input.password) data.passwordHash = await hashPassword(input.password);

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  return ok({ user: updated });
});

export const DELETE = handler(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  if (viewer.role !== "MANAGER") throw forbidden("Only a manager can deactivate people");
  const { id } = await context.params;
  if (viewer.id === id) throw forbidden("You can't deactivate your own account");

  // Deactivate rather than delete so task and time history stays intact.
  await prisma.user.update({ where: { id }, data: { active: false } });
  return ok({ ok: true });
});
