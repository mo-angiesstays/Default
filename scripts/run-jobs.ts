/**
 * Standalone job runner — the same pipeline the /api/cron endpoint drives,
 * for deployments that prefer a worker process or a system cron entry over an
 * HTTP trigger.
 *
 *   npm run worker              # run every step once
 *   npm run worker -- hostaway  # run one step
 *
 * Steps: hostaway, deepclean, schedule, calendar
 */

import { env } from "../src/lib/env";
import { runCalendarSync } from "../src/lib/integrations/google-calendar";
import { runDeepCleanGeneration } from "../src/lib/jobs/deep-clean";
import { runHostawaySync } from "../src/lib/jobs/hostaway-sync";
import { runAutoScheduler } from "../src/lib/scheduler";
import { prisma } from "../src/lib/db";

const STEPS: Record<string, { label: string; run: () => Promise<unknown>; enabled: () => boolean }> =
  {
    hostaway: {
      label: "Hostaway reservation sync",
      run: () => runHostawaySync(),
      enabled: () => env.hostaway.enabled,
    },
    deepclean: {
      label: "Monthly deep-clean generation",
      run: () => runDeepCleanGeneration(),
      enabled: () => true,
    },
    schedule: {
      label: "Auto-assign unassigned work",
      run: () => runAutoScheduler({ daysAhead: 14 }),
      enabled: () => true,
    },
    calendar: {
      label: "Google Calendar push",
      run: () => runCalendarSync(),
      enabled: () => env.google.enabled,
    },
  };

async function main() {
  const requested = process.argv.slice(2).filter((arg) => !arg.startsWith("-"));
  const order = requested.length ? requested : Object.keys(STEPS);

  let failures = 0;

  for (const name of order) {
    const step = STEPS[name];
    if (!step) {
      console.error(`Unknown step "${name}". Known steps: ${Object.keys(STEPS).join(", ")}`);
      failures += 1;
      continue;
    }

    if (!step.enabled()) {
      console.log(`⊘ ${step.label} — skipped, integration not configured`);
      continue;
    }

    process.stdout.write(`▸ ${step.label}… `);
    try {
      const result = await step.run();
      console.log("done");
      console.log(`  ${JSON.stringify(result)}`);
    } catch (error) {
      failures += 1;
      console.log("FAILED");
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  await prisma.$disconnect();
  process.exit(failures ? 1 : 0);
}

void main();
