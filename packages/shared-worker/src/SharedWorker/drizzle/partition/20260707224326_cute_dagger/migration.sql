CREATE TABLE `replicas` (
	`id` text PRIMARY KEY,
	`accountId` text NOT NULL,
	`accountName` text NOT NULL,
	`actorId` text NOT NULL,
	`actorName` text NOT NULL,
	`frontendName` text NOT NULL,
	`frontendVersion` text NOT NULL,
	`databaseName` text NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `replicas_actor_frontend_version_idx` ON `replicas` (`actorId`,`frontendName`,`frontendVersion`);--> statement-breakpoint
CREATE INDEX `replicas_frontend_idx` ON `replicas` (`frontendName`);
