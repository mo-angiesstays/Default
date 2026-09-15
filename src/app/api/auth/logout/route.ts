import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";
import { handler } from "@/lib/api";

export const POST = handler(async () => {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
});
