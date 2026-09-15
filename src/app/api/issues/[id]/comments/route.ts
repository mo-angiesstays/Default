import { z } from "zod";
import { handler, notFound, ok, parseBody, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { notifyUsers } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };

const schema = z.object({
  body: z.string().min(1).max(4000),
  photoUrls: z.array(z.string()).default([]),
});

export const POST = handler(async (request: Request, context: Context) => {
  const viewer = await requireUser();
  const { id } = await context.params;
  const input = await parseBody(request, schema);

  const issue = await prisma.issue.findUnique({
    where: { id },
    select: { id: true, title: true, reportedById: true },
  });
  if (!issue) throw notFound("No such issue");

  const comment = await prisma.issueComment.create({
    data: {
      issueId: id,
      userId: viewer.id,
      body: input.body,
      photoUrls: input.photoUrls,
    },
    include: { user: { select: { id: true, name: true, avatarColor: true } } },
  });

  const managers = await prisma.user.findMany({
    where: { role: "MANAGER", active: true },
    select: { id: true },
  });
  await notifyUsers(
    [...managers.map((m) => m.id), issue.reportedById ?? ""].filter(
      (userId) => userId && userId !== viewer.id,
    ),
    {
      title: `Update on "${issue.title}"`,
      body: `${viewer.name}: ${input.body.slice(0, 120)}`,
      link: "/issues",
      kind: "issue",
    },
  );

  return ok({ comment }, 201);
});
