import type { Rental } from "@agrorende/db";

const HOUR = 3_600_000;

type Timing = Pick<Rental, "status" | "plannedEnd">;

/** A rental is overdue once it is ACTIVE past `plannedEnd + graceHours` (ARCHITECTURE §7.4, EC-RN-20). */
export function isOverdue(rental: Timing, now: Date, graceHours: number): boolean {
  return rental.status === "ACTIVE" && now.getTime() > rental.plannedEnd.getTime() + graceHours * HOUR;
}

/** ACTIVE, not yet overdue, and ending within `dueSoonHours`. */
export function isDueSoon(rental: Timing, now: Date, dueSoonHours: number, graceHours: number): boolean {
  if (rental.status !== "ACTIVE" || isOverdue(rental, now, graceHours)) return false;
  const remaining = rental.plannedEnd.getTime() - now.getTime();
  return remaining <= dueSoonHours * HOUR && remaining > -graceHours * HOUR;
}

/** Mongo filter for ACTIVE rentals that are overdue at `now`. */
export function overdueFilter(now: Date, graceHours: number): Record<string, unknown> {
  return { status: "ACTIVE", deletedAt: null, plannedEnd: { $lt: new Date(now.getTime() - graceHours * HOUR) } };
}

/** Mongo filter for ACTIVE rentals due within `dueSoonHours` that are not overdue yet. */
export function dueSoonFilter(now: Date, dueSoonHours: number, graceHours: number): Record<string, unknown> {
  return {
    status: "ACTIVE",
    deletedAt: null,
    plannedEnd: { $gte: new Date(now.getTime() - graceHours * HOUR), $lte: new Date(now.getTime() + dueSoonHours * HOUR) },
  };
}
