import { handler, ok, requireManager } from "@/lib/api";
import { importListings } from "@/lib/jobs/hostaway-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = handler(async () => {
  await requireManager();
  const result = await importListings();
  return ok({ result });
});
