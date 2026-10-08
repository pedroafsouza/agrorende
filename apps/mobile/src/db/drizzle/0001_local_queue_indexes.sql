CREATE INDEX `location_buffer_recorded_idx` ON `location_buffer` (`recordedAt`);--> statement-breakpoint
CREATE INDEX `media_files_state_idx` ON `media_files` (`state`,`priority`);--> statement-breakpoint
CREATE INDEX `outbox_status_seq_idx` ON `outbox` (`status`,`seq`);--> statement-breakpoint
CREATE INDEX `outbox_entity_idx` ON `outbox` (`entityType`,`entityId`);