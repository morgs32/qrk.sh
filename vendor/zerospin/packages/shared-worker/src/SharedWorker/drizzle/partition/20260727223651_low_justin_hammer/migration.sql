CREATE TABLE `accountFrontendCommandJournal` (
	`id` text PRIMARY KEY,
	`commandId` text NOT NULL,
	`sourceGenerationId` text NOT NULL,
	`accountId` text NOT NULL,
	`accountName` text NOT NULL,
	`actorId` text NOT NULL,
	`actorName` text NOT NULL,
	`frontendName` text NOT NULL,
	`frontendVersion` text NOT NULL,
	`journalKind` text NOT NULL,
	`command` text NOT NULL,
	`sourceCommand` text,
	`mutations` text NOT NULL,
	`appliedMutations` text NOT NULL,
	`stagedCursor` text NOT NULL,
	`stagedAt` integer NOT NULL,
	`originalContractVersion` text NOT NULL,
	`originalPayload` text NOT NULL,
	`lifecycle` text NOT NULL,
	`pushProvenance` text,
	`terminalOutcome` text,
	`targetGenerationId` text,
	`targetFrontendVersion` text,
	`materializedReplicaIndex` integer,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `accountFrontendReplicas` (
	`id` text PRIMARY KEY,
	`accountId` text NOT NULL,
	`accountName` text NOT NULL,
	`actorId` text NOT NULL,
	`actorName` text NOT NULL,
	`frontendName` text NOT NULL,
	`frontendVersion` text NOT NULL,
	`frontendSpecHash` text NOT NULL,
	`frontendSpec` text NOT NULL,
	`sourceTargets` text NOT NULL,
	`databaseName` text NOT NULL,
	`previousDatabaseNames` text NOT NULL,
	`status` text NOT NULL,
	`role` text NOT NULL,
	`replicaIndex` integer NOT NULL,
	`frontendIndex` integer NOT NULL,
	`systemVersion` text NOT NULL,
	`systemWorkerName` text NOT NULL,
	`pendingTransition` text,
	`socketState` text NOT NULL,
	`reconnectAttempt` integer NOT NULL,
	`journalHealth` text NOT NULL,
	`writeSuspended` integer NOT NULL,
	`lastFailure` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `serviceFrontendReplicas` (
	`id` text PRIMARY KEY,
	`serviceName` text NOT NULL,
	`actorId` text NOT NULL,
	`actorName` text NOT NULL,
	`frontendName` text NOT NULL,
	`frontendVersion` text NOT NULL,
	`frontendSpecHash` text NOT NULL,
	`frontendSpec` text NOT NULL,
	`databaseName` text NOT NULL,
	`previousDatabaseNames` text NOT NULL,
	`status` text NOT NULL,
	`role` text NOT NULL,
	`replicaIndex` integer NOT NULL,
	`frontendIndex` integer NOT NULL,
	`systemVersion` text NOT NULL,
	`systemWorkerName` text NOT NULL,
	`pendingTransition` text,
	`socketState` text NOT NULL,
	`reconnectAttempt` integer NOT NULL,
	`lastFailure` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_frontend_command_journal_source_command_idx` ON `accountFrontendCommandJournal` (`sourceGenerationId`,`accountId`,`accountName`,`actorId`,`actorName`,`frontendName`,`frontendVersion`,`journalKind`,`commandId`);--> statement-breakpoint
CREATE INDEX `account_frontend_command_journal_lifecycle_idx` ON `accountFrontendCommandJournal` (`accountId`,`actorId`,`frontendName`,`frontendVersion`,`lifecycle`,`stagedCursor`);--> statement-breakpoint
CREATE INDEX `account_frontend_replicas_target_version_idx` ON `accountFrontendReplicas` (`accountId`,`accountName`,`actorId`,`actorName`,`frontendName`,`frontendVersion`);--> statement-breakpoint
CREATE INDEX `account_frontend_replicas_frontend_status_idx` ON `accountFrontendReplicas` (`frontendName`,`status`);--> statement-breakpoint
CREATE INDEX `service_frontend_replicas_target_version_idx` ON `serviceFrontendReplicas` (`serviceName`,`actorId`,`actorName`,`frontendName`,`frontendVersion`);--> statement-breakpoint
CREATE INDEX `service_frontend_replicas_frontend_status_idx` ON `serviceFrontendReplicas` (`frontendName`,`status`);
