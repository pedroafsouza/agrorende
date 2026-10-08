CREATE TABLE `conflicts` (
	`id` text PRIMARY KEY NOT NULL,
	`mutationId` text NOT NULL,
	`name` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text NOT NULL,
	`code` text NOT NULL,
	`payload` text NOT NULL,
	`createdAt` text NOT NULL,
	`acknowledgedAt` text
);
--> statement-breakpoint
CREATE TABLE `diagnostics_queue` (
	`id` text PRIMARY KEY NOT NULL,
	`createdAt` text NOT NULL,
	`payload` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`nextAttemptAt` text
);
--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`refId` text,
	`step` text NOT NULL,
	`payload` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `location_buffer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`recordedAt` text NOT NULL,
	`lat` real NOT NULL,
	`lng` real NOT NULL,
	`accuracyM` real,
	`speedMps` real,
	`heading` real,
	`batteryLevel` real,
	`workOrderId` text,
	`sentAt` text
);
--> statement-breakpoint
CREATE TABLE `media_files` (
	`mediaId` text PRIMARY KEY NOT NULL,
	`localUri` text NOT NULL,
	`thumbUri` text,
	`mimeType` text NOT NULL,
	`sizeBytes` integer,
	`kind` text NOT NULL,
	`priority` integer DEFAULT 0 NOT NULL,
	`state` text NOT NULL,
	`uploadId` text,
	`partSize` integer,
	`partsDone` text,
	`bytesSent` integer DEFAULT 0 NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`nextAttemptAt` text,
	`wifiOnly` integer DEFAULT 0 NOT NULL,
	`doneAt` text,
	`deleteAfter` text
);
--> statement-breakpoint
CREATE TABLE `outbox` (
	`seq` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`entityType` text NOT NULL,
	`entityId` text NOT NULL,
	`payload` text NOT NULL,
	`occurredAt` text NOT NULL,
	`lat` real,
	`lng` real,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`lastError` text,
	`nextAttemptAt` text,
	`inFlightAt` text,
	`pushAttemptId` text,
	`createdAt` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_id_unique` ON `outbox` (`id`);--> statement-breakpoint
CREATE TABLE `sync_state` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `activity_events` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`actorId` text,
	`deviceId` text,
	`entityType` text,
	`entityId` text,
	`action` text,
	`fromStatus` text,
	`toStatus` text,
	`meta` text,
	`lat` real,
	`lng` real,
	`occurredAt` text,
	`receivedAt` text,
	`clockOffsetMs` integer,
	`mutationId` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `activity_events_dirty_idx` ON `activity_events` (`_dirty`);--> statement-breakpoint
CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`code` text,
	`name` text,
	`category` text,
	`make` text,
	`model` text,
	`year` integer,
	`serialNumber` text,
	`plate` text,
	`ownerType` text,
	`ownerCustomerId` text,
	`condition` text,
	`conditionChangedAt` text,
	`homeSiteId` text,
	`currentSiteId` text,
	`currentPlotId` text,
	`lastLat` real,
	`lastLng` real,
	`lastLocatedAt` text,
	`hourMeter` real,
	`odometerKm` real,
	`tankCapacityL` real,
	`isRentable` integer,
	`defaultRateCents` integer,
	`defaultRateUnit` text,
	`currentRentalId` text,
	`coverMediaId` text,
	`specs` text,
	`notes` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `assets_dirty_idx` ON `assets` (`_dirty`);--> statement-breakpoint
CREATE TABLE `checklist_templates` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text,
	`appliesTo` text,
	`assetCategories` text,
	`templateVersion` integer,
	`items` text,
	`accessories` text,
	`isActive` integer,
	`archivedAt` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `checklist_templates_dirty_idx` ON `checklist_templates` (`_dirty`);--> statement-breakpoint
CREATE TABLE `comments` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`entityType` text,
	`entityId` text,
	`authorId` text,
	`body` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `comments_dirty_idx` ON `comments` (`_dirty`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text,
	`tradeName` text,
	`taxIdType` text,
	`taxId` text,
	`taxIdMasked` text,
	`phone` text,
	`whatsapp` text,
	`email` text,
	`address` text,
	`city` text,
	`state` text,
	`isSupplier` integer,
	`notes` text,
	`archivedAt` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `customers_dirty_idx` ON `customers` (`_dirty`);--> statement-breakpoint
CREATE TABLE `damages` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`assetId` text,
	`zone` text,
	`severity` text,
	`description` text,
	`isPreExisting` integer,
	`detectedInspectionId` text,
	`detectedRentalId` text,
	`matchedDamageId` text,
	`matchStatus` text,
	`disputeStatus` text,
	`customerStatement` text,
	`fieldReportId` text,
	`estimatedCostCents` integer,
	`reportedById` text,
	`repairedAt` text,
	`repairedWorkOrderId` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `damages_dirty_idx` ON `damages` (`_dirty`);--> statement-breakpoint
CREATE TABLE `field_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`number` text,
	`reporterId` text,
	`assetId` text,
	`unregisteredAssetDesc` text,
	`siteId` text,
	`plotId` text,
	`seasonId` text,
	`rentalId` text,
	`damageId` text,
	`category` text,
	`priority` text,
	`machineOperable` integer,
	`suggestedAction` text,
	`title` text,
	`description` text,
	`status` text,
	`statusReason` text,
	`lat` real,
	`lng` real,
	`accuracyM` real,
	`occurredAt` text,
	`receivedAt` text,
	`reviewedById` text,
	`reviewedAt` text,
	`workOrderId` text,
	`flags` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `field_reports_dirty_idx` ON `field_reports` (`_dirty`);--> statement-breakpoint
CREATE TABLE `fuel_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`assetId` text,
	`liters` real,
	`pricePerLiterCents` integer,
	`totalCents` integer,
	`hourMeter` real,
	`odometerKm` real,
	`siteId` text,
	`plotId` text,
	`seasonId` text,
	`operatorId` text,
	`filledAt` text,
	`lat` real,
	`lng` real,
	`notes` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `fuel_logs_dirty_idx` ON `fuel_logs` (`_dirty`);--> statement-breakpoint
CREATE TABLE `inspections` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`type` text,
	`rentalId` text,
	`assetId` text,
	`performedById` text,
	`performedAt` text,
	`templateId` text,
	`templateVersion` integer,
	`templateSnapshot` text,
	`responses` text,
	`hourMeter` real,
	`odometerKm` real,
	`fuelPercent` real,
	`accessories` text,
	`safetyBriefingGiven` integer,
	`operatorName` text,
	`operatorDocument` text,
	`termsAccepted` integer,
	`termsVersion` integer,
	`documentLocale` text,
	`signerName` text,
	`signerDocument` text,
	`signerRole` text,
	`signatureStatus` text,
	`signatureReason` text,
	`customerSignatureMediaId` text,
	`agentSignatureMediaId` text,
	`lat` real,
	`lng` real,
	`notes` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inspections_dirty_idx` ON `inspections` (`_dirty`);--> statement-breakpoint
CREATE TABLE `maintenance_plans` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text,
	`assetId` text,
	`assetCategory` text,
	`trigger` text,
	`intervalHours` real,
	`intervalDays` integer,
	`lastDoneHourMeter` real,
	`lastDoneAt` text,
	`nextDueHourMeter` real,
	`nextDueAt` text,
	`leadHours` real,
	`leadDays` integer,
	`checklistTemplateId` text,
	`isActive` integer,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `maintenance_plans_dirty_idx` ON `maintenance_plans` (`_dirty`);--> statement-breakpoint
CREATE TABLE `media` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`kind` text,
	`status` text,
	`tag` text,
	`mimeType` text,
	`sizeBytes` integer,
	`durationMs` integer,
	`width` integer,
	`height` integer,
	`storageKey` text,
	`thumbnailKey` text,
	`variants` text,
	`caption` text,
	`capturedAt` text,
	`capturedById` text,
	`lat` real,
	`lng` real,
	`uploadedAt` text,
	`parent` text,
	`damageId` text,
	`checklistItemKey` text,
	`isLateEvidence` integer,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `media_dirty_idx` ON `media` (`_dirty`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`userId` text,
	`type` text,
	`title` text,
	`body` text,
	`entityType` text,
	`entityId` text,
	`readAt` text,
	`pushedAt` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `notifications_dirty_idx` ON `notifications` (`_dirty`);--> statement-breakpoint
CREATE TABLE `organization` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`legalName` text,
	`taxId` text,
	`timezone` text,
	`locale` text,
	`supportedLocales` text,
	`currency` text,
	`status` text,
	`plan` text,
	`trialEndsAt` text,
	`pastDueAt` text,
	`suspendedAt` text,
	`cancelledAt` text,
	`purgeAfter` text,
	`termsVersion` text,
	`termsAcceptedAt` text,
	`termsAcceptedById` text,
	`signupSource` text,
	`expectedFieldUsers` text,
	`createdById` text,
	`settings` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `organization_dirty_idx` ON `organization` (`_dirty`);--> statement-breakpoint
CREATE TABLE `parts` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`sku` text,
	`name` text,
	`unit` text,
	`unitCostCents` integer,
	`compatibleCategories` text,
	`minStock` real,
	`isActive` integer,
	`archivedAt` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `parts_dirty_idx` ON `parts` (`_dirty`);--> statement-breakpoint
CREATE TABLE `plots` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`siteId` text,
	`name` text,
	`code` text,
	`areaHa` real,
	`crop` text,
	`boundary` text,
	`centroidLat` real,
	`centroidLng` real,
	`archivedAt` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `plots_dirty_idx` ON `plots` (`_dirty`);--> statement-breakpoint
CREATE TABLE `rental_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`rentalId` text,
	`type` text,
	`description` text,
	`quantity` real,
	`unitAmountCents` integer,
	`amountCents` integer,
	`isAuto` integer,
	`damageId` text,
	`accessoryKey` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rental_charges_dirty_idx` ON `rental_charges` (`_dirty`);--> statement-breakpoint
CREATE TABLE `rentals` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`number` text,
	`direction` text,
	`status` text,
	`assetId` text,
	`customerId` text,
	`customerSnapshot` text,
	`siteId` text,
	`seasonId` text,
	`agentId` text,
	`createdById` text,
	`plannedStart` text,
	`plannedEnd` text,
	`actualStart` text,
	`actualEnd` text,
	`rateCents` integer,
	`rateUnit` text,
	`depositCents` integer,
	`includedHoursPerDay` real,
	`extraHourRateCents` integer,
	`lateFeePerDayCents` integer,
	`fuelPolicy` text,
	`fuelPriceCents` integer,
	`deliveryMode` text,
	`deliveryAddress` text,
	`deliverySiteId` text,
	`deliveryLat` real,
	`deliveryLng` real,
	`documentLocale` text,
	`termsVersion` integer,
	`notes` text,
	`checkOutInspectionId` text,
	`checkInInspectionId` text,
	`chargesTotalCents` integer,
	`chargesVersion` integer,
	`balanceDueCents` integer,
	`dueSoonNotifiedAt` text,
	`overdueNotifiedAt` text,
	`settlementRef` text,
	`closedAt` text,
	`closedById` text,
	`cancelledAt` text,
	`cancelReason` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `rentals_dirty_idx` ON `rentals` (`_dirty`);--> statement-breakpoint
CREATE TABLE `seasons` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text,
	`crop` text,
	`startsOn` text,
	`endsOn` text,
	`isCurrent` integer,
	`criticalWindows` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `seasons_dirty_idx` ON `seasons` (`_dirty`);--> statement-breakpoint
CREATE TABLE `sites` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text,
	`type` text,
	`customerId` text,
	`address` text,
	`city` text,
	`state` text,
	`lat` real,
	`lng` real,
	`radiusM` real,
	`notes` text,
	`isActive` integer,
	`archivedAt` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `sites_dirty_idx` ON `sites` (`_dirty`);--> statement-breakpoint
CREATE TABLE `stock_levels` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`partId` text,
	`stockLocationId` text,
	`quantity` real,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_levels_dirty_idx` ON `stock_levels` (`_dirty`);--> statement-breakpoint
CREATE TABLE `stock_locations` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text,
	`type` text,
	`userId` text,
	`siteId` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `stock_locations_dirty_idx` ON `stock_locations` (`_dirty`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`name` text,
	`phone` text,
	`role` text,
	`skills` text,
	`locale` text,
	`avatarMediaId` text,
	`isActive` integer,
	`joinedAt` text,
	`disabledAt` text,
	`archivedAt` text,
	`dutyStatus` text,
	`dutyChangedAt` text,
	`locationConsentAt` text,
	`scopeEpoch` integer,
	`homeSiteId` text,
	`vanStockLocationId` text,
	`lastSeenAt` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `users_dirty_idx` ON `users` (`_dirty`);--> statement-breakpoint
CREATE TABLE `work_order_parts` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`workOrderId` text,
	`name` text,
	`partNumber` text,
	`quantity` real,
	`unit` text,
	`unitCostCents` integer,
	`partId` text,
	`stockLocationId` text,
	`addedById` text,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_order_parts_dirty_idx` ON `work_order_parts` (`_dirty`);--> statement-breakpoint
CREATE TABLE `work_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`organizationId` text,
	`syncVersion` integer,
	`createdAt` text,
	`updatedAt` text,
	`deletedAt` text,
	`number` text,
	`type` text,
	`status` text,
	`priority` text,
	`title` text,
	`description` text,
	`scheduledFor` text,
	`assetId` text,
	`siteId` text,
	`plotId` text,
	`customerId` text,
	`seasonId` text,
	`fieldReportId` text,
	`rentalId` text,
	`maintenancePlanId` text,
	`damageIds` text,
	`assigneeId` text,
	`previousAssigneeIds` text,
	`createdById` text,
	`dueAt` text,
	`slaAtRiskNotifiedAt` text,
	`slaBreachedAt` text,
	`destLat` real,
	`destLng` real,
	`locationNote` text,
	`holdReason` text,
	`holdNote` text,
	`checklistTemplateId` text,
	`checklistTemplateVersion` integer,
	`checklistSnapshot` text,
	`checklistResponses` text,
	`resolution` text,
	`documentLocale` text,
	`rootCause` text,
	`hourMeterReading` real,
	`customerSignerName` text,
	`signatureStatus` text,
	`signatureReason` text,
	`signatureWitnessName` text,
	`signatureMediaId` text,
	`clockOffsetMs` integer,
	`assignedAt` text,
	`acceptedAt` text,
	`enRouteAt` text,
	`arrivedAt` text,
	`startedAt` text,
	`completedAt` text,
	`verifiedAt` text,
	`verifiedById` text,
	`cancelledAt` text,
	`cancelReason` text,
	`travelMinutes` integer,
	`workMinutes` integer,
	`laborCostCents` integer,
	`partsCostCents` integer,
	`externalCostCents` integer,
	`externalCostNote` text,
	`hasLateEvidence` integer,
	`_dirty` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `work_orders_dirty_idx` ON `work_orders` (`_dirty`);