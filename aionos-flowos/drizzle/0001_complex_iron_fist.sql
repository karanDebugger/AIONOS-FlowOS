CREATE TABLE `flowos_agent_traces` (
	`traceId` varchar(64) NOT NULL,
	`caseId` varchar(64),
	`agentName` varchar(128) NOT NULL,
	`inputReference` text NOT NULL,
	`outputReference` text,
	`status` enum('started','succeeded','failed','abstained','waiting_for_human') NOT NULL DEFAULT 'started',
	`durationMs` int,
	`toolAllowlist` text NOT NULL,
	`retryCount` int NOT NULL DEFAULT 0,
	`errorCode` varchar(128),
	`estimatedCostMicros` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowos_agent_traces_traceId` PRIMARY KEY(`traceId`)
);
--> statement-breakpoint
CREATE TABLE `flowos_approvals` (
	`id` varchar(64) NOT NULL,
	`caseId` varchar(64) NOT NULL,
	`decisionRequired` varchar(255) NOT NULL,
	`evidenceIds` text NOT NULL,
	`recommendation` text NOT NULL,
	`confidence` int,
	`risk` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`affectedSystems` text NOT NULL,
	`consequences` text NOT NULL,
	`requester` varchar(255) NOT NULL,
	`owner` varchar(255),
	`decision` enum('pending','approved','rejected','changes_requested','escalated') NOT NULL DEFAULT 'pending',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`decidedAt` timestamp,
	CONSTRAINT `flowos_approvals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_audit_events` (
	`id` varchar(64) NOT NULL,
	`caseId` varchar(64),
	`actor` varchar(255) NOT NULL,
	`actorType` enum('human','agent','system') NOT NULL,
	`eventType` varchar(128) NOT NULL,
	`oldValue` text,
	`newValue` text,
	`approvalState` varchar(128),
	`idempotencyKey` varchar(128),
	`metadata` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowos_audit_events_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_dependencies` (
	`id` varchar(64) NOT NULL,
	`caseId` varchar(64) NOT NULL,
	`label` varchar(255) NOT NULL,
	`owner` varchar(255),
	`state` enum('complete','blocked','waiting','failed') NOT NULL DEFAULT 'waiting',
	`dependsOn` varchar(64),
	`isCriticalPath` int NOT NULL DEFAULT 0,
	`impact` text NOT NULL,
	`recommendedAction` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowos_dependencies_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_documents` (
	`id` varchar(64) NOT NULL,
	`filename` varchar(255) NOT NULL,
	`documentType` enum('opportunity_brief','statement_of_work','discovery_notes','architecture','use_case_request') NOT NULL,
	`uploadedBy` varchar(128) NOT NULL,
	`source` varchar(255) NOT NULL,
	`department` varchar(128) NOT NULL,
	`accessClassification` enum('public','internal','confidential','restricted') NOT NULL DEFAULT 'internal',
	`checksum` varchar(128) NOT NULL,
	`storageKey` varchar(512),
	`version` int NOT NULL DEFAULT 1,
	`processingStatus` enum('uploaded','processing','indexed','failed') NOT NULL DEFAULT 'uploaded',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flowos_documents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_evaluation_cases` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`category` varchar(128) NOT NULL,
	`expectedBehavior` text NOT NULL,
	`actualBehavior` text,
	`status` enum('not_run','passed','failed') NOT NULL DEFAULT 'not_run',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowos_evaluation_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_evidence` (
	`id` varchar(64) NOT NULL,
	`caseId` varchar(64) NOT NULL,
	`documentId` varchar(64),
	`fieldName` varchar(128) NOT NULL,
	`classification` enum('source_backed','inferred','missing','conflicting') NOT NULL,
	`claim` text NOT NULL,
	`passage` text,
	`citation` varchar(512),
	`relevanceScore` int,
	`confidence` int,
	`documentVersion` int,
	`retrievedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowos_evidence_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_knowledge_sources` (
	`id` varchar(64) NOT NULL,
	`documentId` varchar(64) NOT NULL,
	`chunkIndex` int NOT NULL,
	`section` varchar(255),
	`content` text NOT NULL,
	`metadata` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowos_knowledge_sources_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_metric_observations` (
	`id` varchar(64) NOT NULL,
	`caseId` varchar(64) NOT NULL,
	`metricName` varchar(128) NOT NULL,
	`value` varchar(128) NOT NULL,
	`target` varchar(128),
	`status` enum('healthy','warning','breached') NOT NULL DEFAULT 'healthy',
	`observedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowos_metric_observations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_outcome_cases` (
	`id` varchar(64) NOT NULL,
	`name` varchar(255) NOT NULL,
	`outcomeStatement` text NOT NULL,
	`businessOwner` varchar(255),
	`deliveryOwner` varchar(255),
	`scope` text NOT NULL,
	`exclusions` text NOT NULL,
	`systemsOfRecord` text NOT NULL,
	`dataOwners` text NOT NULL,
	`accessPrerequisites` text NOT NULL,
	`dependencies` text NOT NULL,
	`acceptanceCriteria` text NOT NULL,
	`riskLevel` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`humanApprovers` text NOT NULL,
	`slos` text NOT NULL,
	`launchGate` text NOT NULL,
	`runStateOwner` varchar(255),
	`sourceCitations` text NOT NULL,
	`status` enum('intake','readiness','blocked','approval','handoff','run_state','closed') NOT NULL DEFAULT 'intake',
	`readinessStatus` enum('ready','blocked','needs_human_review') NOT NULL DEFAULT 'needs_human_review',
	`tenantKey` varchar(128) NOT NULL DEFAULT 'demo',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flowos_outcome_cases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_risks` (
	`id` varchar(64) NOT NULL,
	`caseId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`severity` enum('low','medium','high','critical') NOT NULL DEFAULT 'medium',
	`status` enum('open','mitigated','accepted') NOT NULL DEFAULT 'open',
	`mitigation` text NOT NULL,
	`evidenceIds` text NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `flowos_risks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `flowos_work_items` (
	`id` varchar(64) NOT NULL,
	`caseId` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`owner` varchar(255),
	`status` enum('open','in_progress','blocked','done') NOT NULL DEFAULT 'open',
	`source` varchar(128) NOT NULL,
	`idempotencyKey` varchar(128) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `flowos_work_items_id` PRIMARY KEY(`id`),
	CONSTRAINT `flowos_work_items_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
