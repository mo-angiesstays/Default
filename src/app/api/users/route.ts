import { handler, ok, parseBody, requireManager, requireUser, conflict } from "@/lib/api";
import { hashPassword } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { createUserSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const publicSelect = {
  id: true,
  email: true,
  name: true,
  phone: true,
  role: true,
  active: true,
  timezone: true,
  skills: true,
  maxDailyTasks: true,
  avatarColor: true,
  notes: true,
  lastLoginAt: true,
  createdAt: true,
} as const;

export const GET = handler(async (request: Request) => {
  const user = await requireUser();
  const params = new URL(request.url).searchParams;
  const includeInactive = params.get("includeInactive") === "true";

  const users = await prisma.user.findMany({
    where: includeInactive ? {} : { active: true },
    select: {
      ...publicSelect,
      // Pay data is a manager-only field.
      hourlyRate: user.role === "MANAGER",
      _count: { select: { assignedTasks: true } },
    },
    orderBy: [{ role: "asc" }, { name: "asc" }],
  });

  return ok({ users });
});

export const POST = handler(async (request: Request) => {
  await requireManager();
  const input = await parseBody(request, createUserSchema);

  const email = input.email.toLowerCase().trim();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) throw conflict("Someone already has that email address");

  const created = await prisma.user.create({
    data: {
      email,
      name: input.name,
      phone: input.phone ?? null,
      role: input.role,
      timezone: input.timezone,
      skills: input.skills,
      maxDailyTasks: input.maxDailyTasks,
      hourlyRate: input.hourlyRate ?? null,
      avatarColor: input.avatarColor,
      notes: input.notes ?? null,
      passwordHash: await hashPassword(input.password),
    },
    select: publicSelect,
  });

  return ok({ user: created }, 201);
});
