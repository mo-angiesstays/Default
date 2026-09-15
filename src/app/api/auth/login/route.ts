import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createSession, setSessionCookie, verifyPassword } from "@/lib/auth";
import { handler, parseBody, unauthorized } from "@/lib/api";
import { loginSchema } from "@/lib/validation";

export const POST = handler(async (request: Request) => {
  const { email, password } = await parseBody(request, loginSchema);

  const user = await prisma.user.findUnique({
    where: { email: email.toLowerCase().trim() },
  });

  // Same message either way — don't leak which emails exist.
  if (!user || !user.active || !(await verifyPassword(password, user.passwordHash))) {
    throw unauthorized("Email or password is incorrect");
  }

  await setSessionCookie(await createSession(user.id));
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  return NextResponse.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role },
  });
});
