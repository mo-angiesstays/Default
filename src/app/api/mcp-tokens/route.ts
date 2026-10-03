import { z } from "zod";
import { forbidden, handler, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { generateToken } from "@/lib/mcp/auth";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().min(1).max(80).describe("Label, e.g. 'Maria's phone'"),
  /** Managers can mint a token for somebody else; everyone else gets their own. */
  userId: z.string().optional(),
  readOnly: z.boolean().default(false),
  expiresInDays: z.number().int().min(1).max(3650).nullish(),
});

export const GET = handler(async () => {
  const viewer = await requireUser();

  const tokens = await prisma.mcpToken.findMany({
    where: {
      revokedAt: null,
      ...(viewer.role === "MANAGER" ? {} : { userId: viewer.id }),
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      hint: true,
      readOnly: true,
      expiresAt: true,
      lastUsedAt: true,
      createdAt: true,
      user: { select: { id: true, name: true, role: true } },
    },
  });

  return ok({ tokens });
});

export const POST = handler(async (request: Request) => {
  const viewer = await requireUser();
  const input = await parseBody(request, createSchema);

  const targetUserId = input.userId ?? viewer.id;
  if (targetUserId !== viewer.id && viewer.role !== "MANAGER") {
    throw forbidden("Only a manager can create a token for somebody else");
  }

  const { plaintext, hash } = generateToken();

  const token = await prisma.mcpToken.create({
    data: {
      name: input.name,
      tokenHash: hash,
      // Enough to tell two tokens apart in a list, not enough to use.
      hint: `${plaintext.slice(0, 11)}…${plaintext.slice(-4)}`,
      userId: targetUserId,
      readOnly: input.readOnly,
      expiresAt: input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null,
    },
    select: { id: true, name: true, hint: true, readOnly: true, expiresAt: true },
  });

  // The only time the plaintext is ever returned.
  return ok({ token, plaintext }, 201);
});
