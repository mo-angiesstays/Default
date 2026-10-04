/**
 * Checks the install and says what's wrong, in plain language.
 *
 *   npm run doctor
 *
 * Written for someone who is testing this for the first time: every failure
 * names the variable or step that fixes it, and nothing here changes any data.
 */

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../src/lib/env";
import { prisma } from "../src/lib/db";

const run = promisify(execFile);

type Status = "ok" | "warn" | "fail" | "skip";
const results: { status: Status; label: string; detail: string }[] = [];

function record(status: Status, label: string, detail: string) {
  results.push({ status, label, detail });
}

async function checkDatabase() {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    record("fail", "Database", `Can't connect. ${(error as Error).message.split("\n")[0]}`);
    return;
  }

  const [users, properties, templates, tasks] = await Promise.all([
    prisma.user.count(),
    prisma.property.count(),
    prisma.checklistTemplate.count(),
    prisma.task.count(),
  ]);

  record("ok", "Database", `Connected. ${users} user(s), ${properties} propert(ies), ${tasks} task(s).`);

  if (users === 0) {
    record("fail", "Users", "Nobody can sign in. Run: npm run db:seed");
  } else {
    const managers = await prisma.user.count({ where: { role: "MANAGER", active: true } });
    if (managers === 0) record("fail", "Users", "No active manager — nobody can administer the app.");
  }

  if (templates === 0) {
    record("warn", "Checklists", "No checklist templates, so new tasks will have empty checklists. Run: npm run db:seed");
  }

  // The seeded passwords are public knowledge; flag them if they're still live.
  const { verifyPassword } = await import("../src/lib/auth");
  const seeded = await prisma.user.findFirst({
    where: { email: "manager@example.com" },
    select: { passwordHash: true },
  });
  if (seeded && (await verifyPassword("changeme123", seeded.passwordHash))) {
    record(
      "warn",
      "Seed passwords",
      "manager@example.com still has the seeded password. Fine for testing, change it before real data goes in.",
    );
  }
}

async function checkHostaway() {
  if (!env.hostaway.enabled) {
    record("skip", "Hostaway", "Not configured. Set HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_KEY to pull reservations.");
    return;
  }
  const { testConnection } = await import("../src/lib/integrations/hostaway");
  const result = await testConnection();
  record(result.ok ? "ok" : "fail", "Hostaway", result.message);

  if (result.ok) {
    const linked = await prisma.property.count({ where: { hostawayListingId: { not: null } } });
    const unlinked = await prisma.property.count({ where: { hostawayListingId: null, active: true } });
    if (linked === 0) {
      record("warn", "Hostaway listings", "No properties are linked yet. Settings → Import listings.");
    } else if (unlinked > 0) {
      record("warn", "Hostaway listings", `${linked} linked, ${unlinked} not — those won't get turnovers.`);
    }
  }
}

async function checkGoogle() {
  if (!env.google.enabled) {
    record("skip", "Google Calendar", "Not configured. Tasks won't appear on anyone's calendar.");
    return;
  }
  const { testConnection } = await import("../src/lib/integrations/google-calendar");
  const result = await testConnection();
  record(result.ok ? "ok" : "fail", "Google Calendar", result.message);

  if (result.ok && !env.google.impersonateUser) {
    record(
      "warn",
      "Calendar invites",
      "GOOGLE_IMPERSONATE_USER is unset. Events get created but nobody is actually invited.",
    );
  }
}

async function checkAnthropic() {
  if (!env.anthropic.enabled) {
    record(
      "skip",
      "AI",
      "No ANTHROPIC_API_KEY. The scheduler still works on rule scoring; photo and video analysis are off.",
    );
    return;
  }
  try {
    const Anthropic = (await import("@anthropic-ai/sdk")).default;
    const client = new Anthropic({ apiKey: env.anthropic.apiKey });
    // Cheapest possible proof the key works.
    await client.messages.countTokens({
      model: env.anthropic.model,
      messages: [{ role: "user", content: "ping" }],
    });
    record("ok", "AI", `Key works. Scheduling on ${env.anthropic.model}, vision on ${env.anthropic.visionModel}.`);
  } catch (error) {
    record("fail", "AI", `Key rejected: ${(error as Error).message.split("\n")[0]}`);
  }
}

async function checkStorage() {
  const { storage, buildStorageKey } = await import("../src/lib/storage");
  const driver = storage();
  const key = buildStorageKey("doctor-probe.jpg", "image/jpeg");
  // A 1x1 JPEG — small enough to be free, real enough to prove round-tripping.
  const probe = Buffer.from(
    "/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0a" +
      "HBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAA" +
      "AAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==",
    "base64",
  );

  try {
    await driver.put(key, probe, "image/jpeg");
    const back = await driver.read(key, "image/jpeg");
    await driver.delete(key);
    record(
      "ok",
      "Photo storage",
      `${driver.name === "local" ? `Local disk (${env.storage.localDir})` : `S3 bucket ${env.storage.s3.bucket}`} — wrote and read back a test file.` +
        (driver.name === "local"
          ? " Make sure that path is a mounted volume, or photos vanish on redeploy."
          : "") +
        (back.kind === "redirect" ? " Reads are served as signed URLs." : ""),
    );
  } catch (error) {
    record("fail", "Photo storage", `Can't write: ${(error as Error).message.split("\n")[0]}`);
  }
}

async function checkFfmpeg() {
  try {
    const { stdout } = await run("ffprobe", ["-version"]);
    record("ok", "ffmpeg", `Present (${stdout.split("\n")[0].slice(0, 40)}). Video walkthroughs will work.`);
  } catch {
    record("skip", "ffmpeg", "Not installed. Photos are fine; video walkthrough analysis is unavailable.");
  }
}

async function checkJobs() {
  if (!env.cronSecret) {
    record("warn", "Scheduled pipeline", "CRON_SECRET is unset, so nothing can trigger the nightly sync without a login.");
  } else {
    record("ok", "Scheduled pipeline", `Point a scheduler at POST ${env.appUrl}/api/cron with the CRON_SECRET as a bearer token.`);
  }

  const lastRuns = await prisma.jobRun.findMany({ orderBy: { startedAt: "desc" }, take: 4 });
  if (!lastRuns.length) {
    record("warn", "Job history", "Nothing has run yet. Settings → Sync reservations now, to try it once by hand.");
  } else {
    const failed = lastRuns.filter((r) => r.status === "FAILED");
    record(
      failed.length ? "warn" : "ok",
      "Job history",
      failed.length
        ? `${failed.length} of the last ${lastRuns.length} runs failed. Most recent: ${failed[0].job} — ${failed[0].error?.slice(0, 90)}`
        : `Last ${lastRuns.length} run(s) succeeded.`,
    );
  }
}

function checkUrls() {
  if (env.appUrl.includes("localhost")) {
    record(
      "warn",
      "APP_URL",
      "Still localhost. Calendar invites will link somewhere nobody can open, and assistants can't reach the MCP endpoint.",
    );
  } else if (!env.appUrl.startsWith("https://")) {
    record("warn", "APP_URL", "Not HTTPS. MCP connectors require it.");
  } else {
    record("ok", "APP_URL", env.appUrl);
  }
}

const ICON: Record<Status, string> = { ok: "✓", warn: "!", fail: "✗", skip: "–" };

async function main() {
  checkUrls();
  await checkDatabase();
  await checkStorage();
  await checkFfmpeg();
  await checkHostaway();
  await checkGoogle();
  await checkAnthropic();
  await checkJobs();

  const width = Math.max(...results.map((r) => r.label.length));
  console.log("\nTurnKeep health check\n");
  for (const { status, label, detail } of results) {
    console.log(`  ${ICON[status]}  ${label.padEnd(width)}  ${detail}`);
  }

  const fails = results.filter((r) => r.status === "fail").length;
  const warns = results.filter((r) => r.status === "warn").length;
  const skips = results.filter((r) => r.status === "skip").length;

  console.log(
    `\n${fails} blocking, ${warns} worth fixing, ${skips} optional integration(s) off.\n` +
      (fails === 0
        ? "Nothing is stopping you from signing in and using it.\n"
        : "Fix the ✗ items first — the app won't work properly until then.\n"),
  );

  await prisma.$disconnect();
  process.exit(fails ? 1 : 0);
}

void main();
