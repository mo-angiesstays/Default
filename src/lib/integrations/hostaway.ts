import { prisma } from "@/lib/db";
import { env } from "@/lib/env";

/**
 * Hostaway REST client — read-only.
 *
 * The integration is deliberately one-way: we pull listings and reservations
 * and never write back to Hostaway. Access tokens are long-lived, so we cache
 * them in the Setting table rather than re-minting one per request.
 */

const TOKEN_SETTING_KEY = "hostaway.accessToken";

type CachedToken = { token: string; expiresAt: string };

export type HostawayListing = {
  id: number;
  name?: string | null;
  internalListingName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  countryCode?: string | null;
  lat?: number | null;
  lng?: number | null;
  timeZoneName?: string | null;
  bedroomsNumber?: number | null;
  bathroomsNumber?: number | null;
  checkInTimeStart?: number | null;
  checkOutTime?: number | null;
};

export type HostawayReservation = {
  id: number;
  listingMapId: number;
  channelName?: string | null;
  guestName?: string | null;
  guestFirstName?: string | null;
  guestLastName?: string | null;
  guestEmail?: string | null;
  phone?: string | null;
  arrivalDate: string;
  departureDate: string;
  checkInTime?: number | null;
  checkOutTime?: number | null;
  nights?: number | null;
  adults?: number | null;
  children?: number | null;
  pets?: number | null;
  status?: string | null;
};

class HostawayError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "HostawayError";
  }
}

export { HostawayError };

async function readCachedToken(): Promise<string | null> {
  const row = await prisma.setting.findUnique({ where: { key: TOKEN_SETTING_KEY } });
  if (!row) return null;
  const cached = row.value as unknown as CachedToken;
  if (!cached?.token || !cached.expiresAt) return null;
  // Refresh a day early so a long sync never straddles expiry.
  if (new Date(cached.expiresAt).getTime() - Date.now() < 24 * 60 * 60 * 1000) return null;
  return cached.token;
}

async function mintToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: env.hostaway.accountId,
    client_secret: env.hostaway.apiKey,
    scope: "general",
  });

  const response = await fetch(`${env.hostaway.baseUrl}/accessTokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cache-Control": "no-cache",
    },
    body,
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HostawayError(
      `Hostaway rejected the credentials (${response.status}). ${text.slice(0, 200)}`,
      response.status,
    );
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new HostawayError("Hostaway returned no access token");

  const expiresAt = new Date(Date.now() + (json.expires_in ?? 60 * 60 * 24 * 30) * 1000);
  const value: CachedToken = { token: json.access_token, expiresAt: expiresAt.toISOString() };
  await prisma.setting.upsert({
    where: { key: TOKEN_SETTING_KEY },
    create: { key: TOKEN_SETTING_KEY, value },
    update: { value },
  });

  return json.access_token;
}

export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!env.hostaway.enabled) {
    throw new HostawayError(
      "Hostaway is not configured. Set HOSTAWAY_ACCOUNT_ID and HOSTAWAY_API_KEY.",
    );
  }
  if (!forceRefresh) {
    const cached = await readCachedToken();
    if (cached) return cached;
  }
  return mintToken();
}

async function request<T>(path: string, params: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${env.hostaway.baseUrl}${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));

  const call = async (token: string) =>
    fetch(url, {
      headers: { Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" },
      cache: "no-store",
    });

  let response = await call(await getAccessToken());
  // A cached token can still be revoked upstream; mint a fresh one once.
  if (response.status === 401 || response.status === 403) {
    response = await call(await getAccessToken(true));
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new HostawayError(
      `Hostaway ${path} failed (${response.status}). ${text.slice(0, 200)}`,
      response.status,
    );
  }

  const json = (await response.json()) as { status?: string; result?: T; message?: string };
  if (json.status && json.status !== "success") {
    throw new HostawayError(json.message ?? `Hostaway ${path} returned ${json.status}`);
  }
  return json.result as T;
}

export async function fetchListings(): Promise<HostawayListing[]> {
  const out: HostawayListing[] = [];
  const limit = 100;
  for (let offset = 0; offset < 2000; offset += limit) {
    const page = await request<HostawayListing[]>("/listings", { limit, offset });
    if (!page?.length) break;
    out.push(...page);
    if (page.length < limit) break;
  }
  return out;
}

/** Reservations departing inside the window, paged out in full. */
export async function fetchReservations(from: Date, to: Date): Promise<HostawayReservation[]> {
  const out: HostawayReservation[] = [];
  const limit = 100;
  const params = {
    departureStartDate: from.toISOString().slice(0, 10),
    departureEndDate: to.toISOString().slice(0, 10),
    includeResources: 0,
    sortOrder: "departureDate",
  };

  for (let offset = 0; offset < 5000; offset += limit) {
    const page = await request<HostawayReservation[]>("/reservations", {
      ...params,
      limit,
      offset,
    });
    if (!page?.length) break;
    out.push(...page);
    if (page.length < limit) break;
  }
  return out;
}

/** Cheap credential probe for the settings screen. */
export async function testConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const listings = await request<HostawayListing[]>("/listings", { limit: 1 });
    return {
      ok: true,
      message: `Connected. ${listings?.length ? "Listings are readable." : "No listings returned yet."}`,
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Unknown error" };
  }
}

/** Hostaway sends check-in/out as an integer hour (14 → "14:00"). */
export function hourToHHMM(hour: number | null | undefined, fallback: string): string {
  if (hour === null || hour === undefined || Number.isNaN(hour)) return fallback;
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  return `${String(h).padStart(2, "0")}:00`;
}

export function mapReservationStatus(
  status: string | null | undefined,
): "NEW" | "MODIFIED" | "CANCELLED" | "INQUIRY" | "OWNER_STAY" {
  switch ((status ?? "").toLowerCase()) {
    case "modified":
      return "MODIFIED";
    case "cancelled":
    case "canceled":
      return "CANCELLED";
    case "inquiry":
    case "inquirypreapproved":
    case "inquirydenied":
      return "INQUIRY";
    case "ownerstay":
      return "OWNER_STAY";
    default:
      return "NEW";
  }
}
