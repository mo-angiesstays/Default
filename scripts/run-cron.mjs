/**
 * Triggers the nightly pipeline over HTTP.
 *
 *   node scripts/run-cron.mjs
 *
 * This exists because the scheduled job used to be a curl command written
 * inline in the deployment config, and it never ran once: the quoting did not
 * survive the trip into the container, so the shell was handed the whole
 * command line as a single program name and reported it as not found, hourly,
 * for a fortnight, while the dashboard showed a job that was firing on time.
 *
 * Plain JavaScript on purpose — the runtime image has node and nothing else to
 * build with. No arguments, no quotes, no shell: the scheduler needs only two
 * words, which leaves nothing to mis-parse.
 */

const appUrl = process.env.APP_URL;
const secret = process.env.CRON_SECRET;

if (!appUrl) {
  console.error("APP_URL is not set — nothing to call.");
  process.exit(1);
}
if (!secret) {
  console.error("CRON_SECRET is not set — the pipeline would reject the call.");
  process.exit(1);
}

const url = `${appUrl.replace(/\/+$/, "")}/api/cron`;
console.log(`POST ${url}`);

try {
  const response = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  });

  const body = await response.text();

  if (!response.ok) {
    console.error(`Failed: HTTP ${response.status}. ${body.slice(0, 500)}`);
    process.exit(1);
  }

  // The endpoint reports each step separately and keeps going when one fails,
  // so a 200 is not on its own a success: say which steps actually ran.
  try {
    const parsed = JSON.parse(body);
    for (const step of parsed.steps ?? []) {
      console.log(`  ${step.ok ? "ok  " : "FAIL"} ${step.step}${step.error ? ` — ${step.error}` : ""}`);
    }
    if (parsed.allOk === false) {
      console.error("At least one step failed.");
      process.exit(1);
    }
  } catch {
    console.log(body.slice(0, 500));
  }

  console.log("Pipeline finished.");
} catch (error) {
  console.error(`Could not reach ${url}: ${error instanceof Error ? error.message : error}`);
  process.exit(1);
}
