/**
 * Home widget registry (ARCHITECTURE §13.2). Feature tasks replace the link cards by exporting the
 * agreed names from their own folders; this file then re-exports them (change request T03-003).
 */
export { DutyCard, SyncCard } from "./cards";
export { NextJobCard } from "../jobs/widgets";
export { RentalsTodayCard } from "../rentals/widgets";
export { MyReportsCard, QuickReportCard } from "../reports/widgets";
