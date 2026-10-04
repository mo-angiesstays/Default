/**
 * Environment access. Everything optional except DATABASE_URL and AUTH_SECRET —
 * the app runs with integrations switched off if their keys are missing.
 *
 * Every value is a getter reading `process.env` at call time, never a value
 * captured when this module first loaded. That matters because .env files get
 * loaded by different things at different moments (Next at boot, Prisma on
 * import, a worker script of its own accord). With eager values, a module
 * imported before the .env was read would hold an empty credential while its
 * `enabled` getter said the integration was configured — so the app would
 * confidently call an API with no key and report a baffling auth error.
 */

function read(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

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
  get appUrl() {
    return read("APP_URL", "http://localhost:3000");
  },
  get defaultTimezone() {
    return read("DEFAULT_TIMEZONE", "America/New_York");
  },

  hostaway: {
    get accountId() {
      return read("HOSTAWAY_ACCOUNT_ID");
    },
    get apiKey() {
      return read("HOSTAWAY_API_KEY");
    },
    get baseUrl() {
      return read("HOSTAWAY_BASE_URL", "https://api.hostaway.com/v1");
    },
    get enabled() {
      return Boolean(this.accountId && this.apiKey);
    },
  },

  google: {
    get clientEmail() {
      return read("GOOGLE_CLIENT_EMAIL");
    },
    get privateKey() {
      return read("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
    },
    get calendarId() {
      return read("GOOGLE_CALENDAR_ID", "primary");
    },
    /// Workspace user to impersonate via domain-wide delegation. Required for
    /// attendee invites — a bare service account cannot invite without it.
    get impersonateUser() {
      return read("GOOGLE_IMPERSONATE_USER");
    },
    get enabled() {
      return Boolean(this.clientEmail && this.privateKey);
    },
  },

  anthropic: {
    get apiKey() {
      return read("ANTHROPIC_API_KEY");
    },
    get model() {
      return read("ANTHROPIC_MODEL", "claude-opus-5-5");
    },
    /// Vision runs on its own setting: triage is a judgement call worth the
    /// better model, bulk turnover checks are not.
    get visionModel() {
      return read("ANTHROPIC_VISION_MODEL", this.model);
    },
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  get cronSecret() {
    return read("CRON_SECRET");
  },

  storage: {
    /// "local" writes to disk; "s3" targets any S3-compatible bucket.
    get driver() {
      return (read("STORAGE_DRIVER", "local") === "s3" ? "s3" : "local") as "local" | "s3";
    },
    get localDir() {
      return read("STORAGE_LOCAL_DIR", "./uploads");
    },
    /// Cap on a single upload, after the browser has already downscaled it.
    get maxUploadBytes() {
      return Number(read("MAX_UPLOAD_BYTES", String(15 * 1024 * 1024)));
    },
    s3: {
      get bucket() {
        return read("S3_BUCKET");
      },
      get region() {
        return read("S3_REGION", "us-east-1");
      },
      get endpoint() {
        return read("S3_ENDPOINT");
      },
      get accessKeyId() {
        return read("S3_ACCESS_KEY_ID");
      },
      get secretAccessKey() {
        return read("S3_SECRET_ACCESS_KEY");
      },
      get forcePathStyle() {
        return read("S3_FORCE_PATH_STYLE") === "true";
      },
      get signedUrlSeconds() {
        return Number(read("S3_SIGNED_URL_SECONDS", "3600"));
      },
    },
  },
};
