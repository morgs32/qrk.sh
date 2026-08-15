CREATE TABLE `aggregateFrontendReplicas` (
	`id` text PRIMARY KEY,
	`aggregateId` text NOT NULL,
	`aggregateName` text NOT NULL,
	`userId` text NOT NULL,
	`frontendName` text NOT NULL,
	`aggregateFrontendLockKey` text NOT NULL,
	`aggregateFrontendLock` text NOT NULL,
	`frontendSpec` text NOT NULL,
	`databaseName` text NOT NULL,
	`createdAt` integer NOT NULL
);--> statement-breakpoint
CREATE TABLE `serviceFrontendReplicas` (
	`id` text PRIMARY KEY,
	`serviceName` text NOT NULL,
	`userId` text NOT NULL,
	`frontendName` text NOT NULL,
	`serviceFrontendLockKey` text NOT NULL,
	`serviceFrontendLock` text NOT NULL,
	`frontendSpec` text NOT NULL,
	`databaseName` text NOT NULL,
	`createdAt` integer NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX `aggregate_frontend_replicas_target_lock_idx` ON `aggregateFrontendReplicas` (`aggregateId`,`aggregateName`,`userId`,`frontendName`,`aggregateFrontendLockKey`);--> statement-breakpoint
CREATE UNIQUE INDEX `service_frontend_replicas_target_lock_idx` ON `serviceFrontendReplicas` (`serviceName`,`userId`,`frontendName`,`serviceFrontendLockKey`);
