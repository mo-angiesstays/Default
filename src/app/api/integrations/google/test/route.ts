import { handler, ok, requireManager } from "@/lib/api";
import { testConnection } from "@/lib/integrations/google-calendar";

export const dynamic = "force-dynamic";

export const POST = handler(async () => {
  await requireManager();
  return ok(await testConnection());
});
