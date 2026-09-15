/**
 * Environment access. Everything optional except DATABASE_URL and AUTH_SECRET —
 * the app runs with integrations switched off if their keys are missing.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable ${name}. Copy .env.example to .env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  appUrl: process.env.APP_URL ?? "http://localhost:3000",
  defaultTimezone: process.env.DEFAULT_TIMEZONE ?? "America/New_York",

  hostaway: {
    accountId: process.env.HOSTAWAY_ACCOUNT_ID ?? "",
    apiKey: process.env.HOSTAWAY_API_KEY ?? "",
    baseUrl: process.env.HOSTAWAY_BASE_URL ?? "https://api.hostaway.com/v1",
    get enabled() {
      return Boolean(process.env.HOSTAWAY_ACCOUNT_ID && process.env.HOSTAWAY_API_KEY);
    },
  },

  google: {
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL ?? "",
    privateKey: (process.env.GOOGLE_PRIVATE_KEY ?? "").replace(/\\n/g, "\n"),
    calendarId: process.env.GOOGLE_CALENDAR_ID ?? "primary",
    /// Workspace user to impersonate via domain-wide delegation. Required for
    /// attendee invites — a bare service account cannot invite without it.
    impersonateUser: process.env.GOOGLE_IMPERSONATE_USER ?? "",
    get enabled() {
      return Boolean(process.env.GOOGLE_CLIENT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
    },
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY ?? "",
    model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5",
    get enabled() {
      return Boolean(process.env.ANTHROPIC_API_KEY);
    },
  },

  cronSecret: process.env.CRON_SECRET ?? "",

  storage: {
    /// "local" writes to disk; "s3" targets any S3-compatible bucket.
    driver: (process.env.STORAGE_DRIVER ?? "local") as "local" | "s3",
    localDir: process.env.STORAGE_LOCAL_DIR ?? "./uploads",
    /// Cap on a single upload, after the browser has already downscaled it.
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 15 * 1024 * 1024),
    s3: {
      bucket: process.env.S3_BUCKET ?? "",
      region: process.env.S3_REGION ?? "us-east-1",
      endpoint: process.env.S3_ENDPOINT ?? "",
      accessKeyId: process.env.S3_ACCESS_KEY_ID ?? "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? "",
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      signedUrlSeconds: Number(process.env.S3_SIGNED_URL_SECONDS ?? 3600),
    },
  },
};
