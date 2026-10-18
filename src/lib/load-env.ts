/**
 * Loads .env for processes Next didn't start.
 *
 * Next reads .env itself at boot, so the app and its API routes never need
 * this. The standalone entry points — the seed, the doctor and the job runner —
 * are plain `tsx` processes with no such step, and today they only see their
 * variables because importing `@prisma/client` happens to load .env as a side
 * effect. That is incidental, not a contract: it ties every variable in the
 * file to an unrelated package's startup behaviour, and it leaves anything
 * imported before Prisma reading an empty environment.
 *
 * Importing this module first makes the load explicit and ordering-independent.
 *
 * Two deliberate properties:
 *   - A missing .env is fine, so a deployed container that injects real
 *     environment variables and ships no file still starts.
 *   - `process.loadEnvFile` leaves already-set variables alone, so the real
 *     environment always wins over the file and a production value can never
 *     be clobbered by a stale local one.
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

const envPath = resolve(process.cwd(), ".env");

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
