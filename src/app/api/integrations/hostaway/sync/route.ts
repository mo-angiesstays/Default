import { handler, ok, requireJobAccess } from "@/lib/api";
import { runHostawaySync } from "@/lib/jobs/hostaway-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Pulls reservations and creates/moves the matching turnover tasks. */
export const POST = handler(async (request: Request) => {
  await requireJobAccess(request);
  const importListings = new URL(request.url).searchParams.get("importListings") === "true";
  const summary = await runHostawaySync({ importListingsFirst: importListings });
  return ok({ summary });
});
