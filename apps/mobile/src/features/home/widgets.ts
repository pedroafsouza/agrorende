/**
 * Home widget registry (ARCHITECTURE §13.2). Feature tasks replace the link cards by exporting the
 * agreed names from their own folders; this file then re-exports them (change request T03-003).
 */
export { DutyCard, MyReportsCard, NextJobCard, QuickReportCard, RentalsTodayCard, SyncCard } from "./cards";
