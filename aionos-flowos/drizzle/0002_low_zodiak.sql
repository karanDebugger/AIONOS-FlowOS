ALTER TABLE `users` MODIFY COLUMN `role` enum('user','admin','operator','reviewer','viewer') NOT NULL DEFAULT 'viewer';--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `userId` varchar(128);--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `modelProvider` varchar(128);--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `modelName` varchar(128);--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `inputTokens` int;--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `outputTokens` int;--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `retrievalLatencyMs` int;--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `llmLatencyMs` int;--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `totalWorkflowLatencyMs` int;--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `safetyFlags` text;--> statement-breakpoint
ALTER TABLE `flowos_agent_traces` ADD `humanReviewRequired` int DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_approvals` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_audit_events` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_audit_events` ADD `userId` varchar(128);--> statement-breakpoint
ALTER TABLE `flowos_dependencies` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_documents` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_documents` ADD `supersedesId` varchar(64);--> statement-breakpoint
ALTER TABLE `flowos_evaluation_cases` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_knowledge_sources` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_knowledge_sources` ADD `documentVersion` int DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_knowledge_sources` ADD `embedding` text;--> statement-breakpoint
ALTER TABLE `flowos_knowledge_sources` ADD `embeddingModel` varchar(128);--> statement-breakpoint
ALTER TABLE `flowos_knowledge_sources` ADD `embeddingChecksum` varchar(128);--> statement-breakpoint
ALTER TABLE `flowos_knowledge_sources` ADD `embeddingStatus` enum('pending','indexed','failed') DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_knowledge_sources` ADD `embeddingDimensions` int;--> statement-breakpoint
ALTER TABLE `flowos_metric_observations` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_risks` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `department` varchar(128) DEFAULT 'Operations' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` enum('active','suspended') DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `flowos_work_items` ADD `tenantKey` varchar(128) DEFAULT 'demo' NOT NULL;