import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";

/**
 * Access tokens for the MCP server.
 *
 * Every token belongs to a person, not to the installation. That is the whole
 * point: when Maria connects TurnKeep to her own Claude or ChatGPT, she gets
 * Maria's jobs, not the manager's view of everybody. A single shared bot
 * credential cannot express that, so there isn't one.
 *
 * Tokens are stored as SHA-256 hashes — the plaintext is shown once, at
 * creation, and is unrecoverable afterwards.
 */

const PREFIX = "tk_mcp_";

export type McpIdentity = {
  userId: string;
  name: string;
  email: string;
  role: Role;
  timezone: string;
  tokenId: string;
  /** Read-only tokens can't mutate anything, whatever the person's role. */
  readOnly: boolean;
};

export function generateToken(): { plaintext: string; hash: string } {
  const plaintext = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  return { plaintext, hash: hashToken(plaintext) };
}

export function hashToken(plaintext: string): string {
  return createHash("sha256").update(plaintext).digest("hex");
}

/** Constant-time compare so a token can't be recovered by timing the response. */
function sameHash(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "hex");
  const bufB = Buffer.from(b, "hex");
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

export function bearerFrom(request: Request): string | null {
  const header = request.headers.get("authorization") ?? "";
  if (!header.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice(7).trim();
  return token || null;
}

/** Resolves a bearer token to the person it belongs to, or null. */
export async function identifyFromToken(token: string): Promise<McpIdentity | null> {
  if (!token.startsWith(PREFIX)) return null;

  const candidates = await prisma.mcpToken.findMany({
    where: { revokedAt: null },
    include: {
      user: {
        select: { id: true, name: true, email: true, role: true, timezone: true, active: true },
      },
    },
  });

  for (const candidate of candidates) {
    if (!sameHash(candidate.tokenHash, hashToken(token))) continue;
    if (!candidate.user.active) return null;
    if (candidate.expiresAt && candidate.expiresAt < new Date()) return null;

    // Best-effort; a failed write must not block the call.
    prisma.mcpToken
      .update({ where: { id: candidate.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    return {
      userId: candidate.user.id,
      name: candidate.user.name,
      email: candidate.user.email,
      role: candidate.user.role,
      timezone: candidate.user.timezone,
      tokenId: candidate.id,
      readOnly: candidate.readOnly,
    };
  }
  return null;
}

export const isManager = (identity: McpIdentity) => identity.role === "MANAGER";

/** Throws a message the model will relay verbatim to the person. */
export function assertCanWrite(identity: McpIdentity): void {
  if (identity.readOnly) {
    throw new Error(
      "This connection is read-only. Ask a manager for a read-write token to make changes.",
    );
  }
}

export function assertManager(identity: McpIdentity, action: string): void {
  if (!isManager(identity)) {
    throw new Error(`Only a manager can ${action}.`);
  }
}
