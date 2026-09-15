import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import type { Role } from "@prisma/client";
import { getCurrentUser, type SessionUser } from "@/lib/auth";
import { env } from "@/lib/env";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (m: string) => new HttpError(400, m);
export const unauthorized = (m = "Sign in required") => new HttpError(401, m);
export const forbidden = (m = "You don't have access to this") => new HttpError(403, m);
export const notFound = (m = "Not found") => new HttpError(404, m);
export const conflict = (m: string) => new HttpError(409, m);

/** Wraps a route handler so thrown HttpError/ZodError become clean JSON. */
export function handler<A extends unknown[]>(
  fn: (...args: A) => Promise<NextResponse | Response>,
) {
  return async (...args: A): Promise<NextResponse | Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof HttpError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }
      if (error instanceof ZodError) {
        return NextResponse.json(
          {
            error: "Those values didn't validate",
            details: error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
          },
          { status: 422 },
        );
      }
      console.error("[api] unhandled error", error);
      const message = error instanceof Error ? error.message : "Unexpected error";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw forbidden(`Requires ${roles.join(" or ")} access`);
  return user;
}

export async function requireManager(): Promise<SessionUser> {
  return requireRole("MANAGER");
}

export async function parseBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    throw badRequest("Request body must be JSON");
  }
  return schema.parse(json);
}

export function parseQuery<T>(request: Request, schema: ZodType<T>): T {
  const params = new URL(request.url).searchParams;
  const raw: Record<string, string | string[]> = {};
  for (const key of new Set(params.keys())) {
    const all = params.getAll(key);
    raw[key] = all.length > 1 ? all : all[0];
  }
  return schema.parse(raw);
}

export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status });

/**
 * Background job endpoints accept either a signed-in manager or the shared
 * CRON_SECRET (as `Authorization: Bearer …` or `?key=`), so a scheduler with no
 * cookie jar can drive them.
 */
export async function requireJobAccess(request: Request): Promise<void> {
  if (env.cronSecret) {
    const header = request.headers.get("authorization") ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    const query = new URL(request.url).searchParams.get("key") ?? "";
    if (bearer === env.cronSecret || query === env.cronSecret) return;
  }
  await requireManager();
}
