import { DateTime } from "luxon";
import { prisma } from "@/lib/db";
import { env } from "@/lib/env";
import {
  fetchListings,
  fetchReservations,
  hourToHHMM,
  mapReservationStatus,
  type HostawayReservation,
} from "@/lib/integrations/hostaway";
import { createTask } from "@/lib/tasks";
import { atLocalTime } from "@/lib/time";

export type SyncSummary = {
  listingsSeen: number;
  propertiesLinked: number;
  reservationsSeen: number;
  reservationsUpserted: number;
  tasksCreated: number;
  tasksRescheduled: number;
  tasksCancelled: number;
  unmatchedListingIds: string[];
  warnings: string[];
};

/**
 * Imports Hostaway listings as properties. Existing properties keep their
 * local edits — only the Hostaway link and address are refreshed.
 */
export async function importListings(): Promise<{ created: number; linked: number }> {
  const listings = await fetchListings();
  let created = 0;
  let linked = 0;

  for (const listing of listings) {
    const hostawayListingId = String(listing.id);
    const name = listing.internalListingName || listing.name || `Listing ${listing.id}`;

    const existing = await prisma.property.findUnique({ where: { hostawayListingId } });
    const data = {
      hostawayListingId,
      addressLine1: listing.address ?? undefined,
      city: listing.city ?? undefined,
      state: listing.state ?? undefined,
      postalCode: listing.zipcode ?? undefined,
      country: listing.countryCode ?? "US",
      lat: listing.lat ?? undefined,
      lng: listing.lng ?? undefined,
      timezone: listing.timeZoneName || env.defaultTimezone,
      bedrooms: listing.bedroomsNumber ?? 1,
      bathrooms: listing.bathroomsNumber ?? 1,
      checkInTime: hourToHHMM(listing.checkInTimeStart, "16:00"),
      checkOutTime: hourToHHMM(listing.checkOutTime, "10:00"),
    };

    if (existing) {
      await prisma.property.update({ where: { id: existing.id }, data });
      linked += 1;
      continue;
    }

    // A property may already exist under the same name from manual setup.
    const byName = await prisma.property.findFirst({
      where: { name, hostawayListingId: null },
    });
    if (byName) {
      await prisma.property.update({ where: { id: byName.id }, data });
      linked += 1;
    } else {
      await prisma.property.create({ data: { name, ...data } });
      created += 1;
    }
  }

  return { created, linked };
}

/**
 * Pulls reservations and makes sure every check-out has exactly one turnover
 * task. Re-running is safe: tasks are keyed off the reservation, so a changed
 * departure date moves the existing task instead of creating a second one.
 */
export async function syncReservationsAndTurnovers(options?: {
  daysBack?: number;
  daysForward?: number;
}): Promise<SyncSummary> {
  const daysBack = options?.daysBack ?? 2;
  const daysForward = options?.daysForward ?? 60;

  const from = DateTime.utc().minus({ days: daysBack }).startOf("day").toJSDate();
  const to = DateTime.utc().plus({ days: daysForward }).endOf("day").toJSDate();

  const summary: SyncSummary = {
    listingsSeen: 0,
    propertiesLinked: 0,
    reservationsSeen: 0,
    reservationsUpserted: 0,
    tasksCreated: 0,
    tasksRescheduled: 0,
    tasksCancelled: 0,
    unmatchedListingIds: [],
    warnings: [],
  };

  const reservations = await fetchReservations(from, to);
  summary.reservationsSeen = reservations.length;

  const properties = await prisma.property.findMany({
    where: { hostawayListingId: { not: null } },
  });
  const byListing = new Map(properties.map((p) => [p.hostawayListingId!, p]));
  summary.propertiesLinked = properties.length;
  summary.listingsSeen = new Set(reservations.map((r) => String(r.listingMapId))).size;

  // Group by listing so we can spot back-to-back bookings.
  const byListingReservations = new Map<string, HostawayReservation[]>();
  for (const reservation of reservations) {
    const key = String(reservation.listingMapId);
    const list = byListingReservations.get(key) ?? [];
    list.push(reservation);
    byListingReservations.set(key, list);
  }

  const unmatched = new Set<string>();

  for (const [listingId, group] of byListingReservations) {
    const property = byListing.get(listingId);
    if (!property) {
      unmatched.add(listingId);
      continue;
    }

    group.sort((a, b) => a.arrivalDate.localeCompare(b.arrivalDate));
    const zone = property.timezone || env.defaultTimezone;

    for (const reservation of group) {
      const status = mapReservationStatus(reservation.status);

      const checkOutDate = DateTime.fromISO(reservation.departureDate, { zone });
      const checkInDate = DateTime.fromISO(reservation.arrivalDate, { zone });
      if (!checkOutDate.isValid || !checkInDate.isValid) {
        summary.warnings.push(`Reservation ${reservation.id} has unparseable dates`);
        continue;
      }

      const checkOutAt = atLocalTime(
        checkOutDate.toJSDate(),
        hourToHHMM(reservation.checkOutTime, property.checkOutTime),
        zone,
      );
      const checkInAt = atLocalTime(
        checkInDate.toJSDate(),
        hourToHHMM(reservation.checkInTime, property.checkInTime),
        zone,
      );

      // The next arrival at this property tells us whether it's a same-day turn.
      // Cancelled and inquiry bookings must not set a deadline — nobody is coming.
      const nextArrival = group.find(
        (other) =>
          other.id !== reservation.id &&
          other.arrivalDate >= reservation.departureDate &&
          !["CANCELLED", "INQUIRY"].includes(mapReservationStatus(other.status)),
      );
      const sameDayTurn = nextArrival?.arrivalDate === reservation.departureDate;
      const nextCheckInAt = nextArrival
        ? atLocalTime(
            DateTime.fromISO(nextArrival.arrivalDate, { zone }).toJSDate(),
            hourToHHMM(nextArrival.checkInTime, property.checkInTime),
            zone,
          )
        : null;

      const guestName =
        reservation.guestName ||
        [reservation.guestFirstName, reservation.guestLastName].filter(Boolean).join(" ") ||
        null;

      const saved = await prisma.reservation.upsert({
        where: { hostawayReservationId: String(reservation.id) },
        create: {
          hostawayReservationId: String(reservation.id),
          hostawayListingId: listingId,
          propertyId: property.id,
          guestName,
          guestEmail: reservation.guestEmail ?? null,
          guestPhone: reservation.phone ?? null,
          channel: reservation.channelName ?? null,
          status,
          checkIn: checkInAt,
          checkOut: checkOutAt,
          nights: reservation.nights ?? 1,
          adults: reservation.adults ?? 0,
          children: reservation.children ?? 0,
          pets: reservation.pets ?? 0,
          sameDayTurn,
          raw: reservation as unknown as object,
        },
        update: {
          propertyId: property.id,
          guestName,
          guestEmail: reservation.guestEmail ?? null,
          guestPhone: reservation.phone ?? null,
          channel: reservation.channelName ?? null,
          status,
          checkIn: checkInAt,
          checkOut: checkOutAt,
          nights: reservation.nights ?? 1,
          adults: reservation.adults ?? 0,
          children: reservation.children ?? 0,
          pets: reservation.pets ?? 0,
          sameDayTurn,
          raw: reservation as unknown as object,
        },
      });
      summary.reservationsUpserted += 1;

      const dedupeKey = `hostaway:turnover:${reservation.id}`;
      const existingTask = await prisma.task.findUnique({ where: { dedupeKey } });

      // A cancelled booking should not leave a phantom clean on the board.
      if (status === "CANCELLED" || status === "INQUIRY") {
        if (existingTask && !["COMPLETED", "VERIFIED", "CANCELLED"].includes(existingTask.status)) {
          await prisma.task.update({
            where: { id: existingTask.id },
            data: {
              status: "CANCELLED",
              description: appendNote(
                existingTask.description,
                `Auto-cancelled: Hostaway reservation is ${status.toLowerCase()}.`,
              ),
              // Queue the calendar event for removal.
              googleSyncedAt: null,
            },
          });
          summary.tasksCancelled += 1;
        }
        continue;
      }

      if (!existingTask) {
        await createTask({
          propertyId: property.id,
          type: "TURNOVER",
          source: "HOSTAWAY",
          reservationId: saved.id,
          dedupeKey,
          scheduledStart: checkOutAt,
          estimatedMinutes: property.turnoverMinutes,
          dueAt: nextCheckInAt ?? null,
          priority: sameDayTurn ? "HIGH" : "NORMAL",
          description: turnoverDescription(guestName, sameDayTurn, reservation.nights ?? 1),
        });
        summary.tasksCreated += 1;
        continue;
      }

      // Departure moved — follow it, unless the clean is already under way.
      const movable = ["UNASSIGNED", "ASSIGNED", "ACCEPTED"].includes(existingTask.status);
      const startChanged = existingTask.scheduledStart?.getTime() !== checkOutAt.getTime();
      const dueChanged = (existingTask.dueAt?.getTime() ?? null) !== (nextCheckInAt?.getTime() ?? null);

      if (movable && (startChanged || dueChanged)) {
        await prisma.task.update({
          where: { id: existingTask.id },
          data: {
            scheduledStart: checkOutAt,
            scheduledEnd: new Date(checkOutAt.getTime() + existingTask.estimatedMinutes * 60_000),
            dueAt: nextCheckInAt,
            priority: sameDayTurn ? "HIGH" : existingTask.priority,
            // Force a calendar re-push for the new time.
            googleSyncedAt: null,
          },
        });
        summary.tasksRescheduled += 1;
      }
    }
  }

  summary.unmatchedListingIds = [...unmatched];
  if (unmatched.size) {
    summary.warnings.push(
      `${unmatched.size} Hostaway listing(s) have no matching property. Run "Import listings" to link them.`,
    );
  }

  return summary;
}

function turnoverDescription(
  guestName: string | null,
  sameDayTurn: boolean,
  nights: number,
): string {
  const parts = [
    guestName ? `Departing guest: ${guestName}.` : null,
    `${nights} night${nights === 1 ? "" : "s"} stayed.`,
    sameDayTurn ? "SAME-DAY TURN — next guest arrives today." : null,
  ].filter(Boolean);
  return parts.join(" ");
}

function appendNote(existing: string | null, note: string): string {
  return existing ? `${existing}\n\n${note}` : note;
}

/** Wraps a sync in a JobRun record so the settings screen can show history. */
export async function runHostawaySync(options?: { importListingsFirst?: boolean }) {
  const run = await prisma.jobRun.create({ data: { job: "hostaway-sync" } });
  try {
    let listingImport = { created: 0, linked: 0 };
    if (options?.importListingsFirst) listingImport = await importListings();

    const summary = await syncReservationsAndTurnovers();
    const merged = { ...summary, listingsCreated: listingImport.created };

    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "SUCCESS", finishedAt: new Date(), summary: merged as object },
    });
    return merged;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.jobRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), error: message },
    });
    throw error;
  }
}
