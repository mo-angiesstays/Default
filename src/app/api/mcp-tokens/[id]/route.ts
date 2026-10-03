import { forbidden, handler, notFound, ok, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

/** Revoking is immediate — the next call with that token fails. */
export const DELETE = handler(async (_request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;

  const token = await prisma.mcpToken.findUnique({ where: { id } });
  if (!token || token.revokedAt) throw notFound("No such token");
  if (token.userId !== viewer.id && viewer.role !== "MANAGER") {
    throw forbidden("That token isn't yours");
  }

  await prisma.mcpToken.update({ where: { id }, data: { revokedAt: new Date() } });
  return ok({ ok: true });
});
