import { int, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin", "operator", "reviewer", "viewer"]).default("viewer").notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  department: varchar("department", { length: 128 }).default("Operations").notNull(),
  status: mysqlEnum("status", ["active", "suspended"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const documents = mysqlTable("flowos_documents", {
  id: varchar("id", { length: 64 }).primaryKey(),
  filename: varchar("filename", { length: 255 }).notNull(),
  documentType: mysqlEnum("documentType", ["opportunity_brief", "statement_of_work", "discovery_notes", "architecture", "use_case_request"]).notNull(),
  uploadedBy: varchar("uploadedBy", { length: 128 }).notNull(),
  source: varchar("source", { length: 255 }).notNull(),
  department: varchar("department", { length: 128 }).notNull(),
  accessClassification: mysqlEnum("accessClassification", ["public", "internal", "confidential", "restricted"]).default("internal").notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  supersedesId: varchar("supersedesId", { length: 64 }),
  checksum: varchar("checksum", { length: 128 }).notNull(),
  storageKey: varchar("storageKey", { length: 512 }),
  version: int("version").default(1).notNull(),
  processingStatus: mysqlEnum("processingStatus", ["uploaded", "processing", "indexed", "failed"]).default("uploaded").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const outcomeCases = mysqlTable("flowos_outcome_cases", {
  id: varchar("id", { length: 64 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  outcomeStatement: text("outcomeStatement").notNull(),
  businessOwner: varchar("businessOwner", { length: 255 }),
  deliveryOwner: varchar("deliveryOwner", { length: 255 }),
  scope: text("scope").notNull(),
  exclusions: text("exclusions").notNull(),
  systemsOfRecord: text("systemsOfRecord").notNull(),
  dataOwners: text("dataOwners").notNull(),
  accessPrerequisites: text("accessPrerequisites").notNull(),
  dependencies: text("dependencies").notNull(),
  acceptanceCriteria: text("acceptanceCriteria").notNull(),
  riskLevel: mysqlEnum("riskLevel", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  humanApprovers: text("humanApprovers").notNull(),
  slos: text("slos").notNull(),
  launchGate: text("launchGate").notNull(),
  runStateOwner: varchar("runStateOwner", { length: 255 }),
  sourceCitations: text("sourceCitations").notNull(),
  status: mysqlEnum("status", ["intake", "readiness", "blocked", "approval", "handoff", "run_state", "closed"]).default("intake").notNull(),
  readinessStatus: mysqlEnum("readinessStatus", ["ready", "blocked", "needs_human_review"]).default("needs_human_review").notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const evidence = mysqlTable("flowos_evidence", {
  id: varchar("id", { length: 64 }).primaryKey(),
  caseId: varchar("caseId", { length: 64 }).notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  documentId: varchar("documentId", { length: 64 }),
  fieldName: varchar("fieldName", { length: 128 }).notNull(),
  classification: mysqlEnum("classification", ["source_backed", "inferred", "missing", "conflicting"]).notNull(),
  claim: text("claim").notNull(),
  passage: text("passage"),
  citation: varchar("citation", { length: 512 }),
  relevanceScore: int("relevanceScore"),
  confidence: int("confidence"),
  documentVersion: int("documentVersion"),
  retrievedAt: timestamp("retrievedAt").defaultNow().notNull(),
});

export const dependencies = mysqlTable("flowos_dependencies", {
  id: varchar("id", { length: 64 }).primaryKey(),
  caseId: varchar("caseId", { length: 64 }).notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  owner: varchar("owner", { length: 255 }),
  state: mysqlEnum("state", ["complete", "blocked", "waiting", "failed"]).default("waiting").notNull(),
  dependsOn: varchar("dependsOn", { length: 64 }),
  isCriticalPath: int("isCriticalPath").default(0).notNull(),
  impact: text("impact").notNull(),
  recommendedAction: text("recommendedAction").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const approvals = mysqlTable("flowos_approvals", {
  id: varchar("id", { length: 64 }).primaryKey(),
  caseId: varchar("caseId", { length: 64 }).notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  decisionRequired: varchar("decisionRequired", { length: 255 }).notNull(),
  evidenceIds: text("evidenceIds").notNull(),
  recommendation: text("recommendation").notNull(),
  confidence: int("confidence"),
  risk: mysqlEnum("risk", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  affectedSystems: text("affectedSystems").notNull(),
  consequences: text("consequences").notNull(),
  requester: varchar("requester", { length: 255 }).notNull(),
  owner: varchar("owner", { length: 255 }),
  decision: mysqlEnum("decision", ["pending", "approved", "rejected", "changes_requested", "escalated"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  decidedAt: timestamp("decidedAt"),
});

export const workItems = mysqlTable("flowos_work_items", {
  id: varchar("id", { length: 64 }).primaryKey(),
  caseId: varchar("caseId", { length: 64 }).notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  owner: varchar("owner", { length: 255 }),
  status: mysqlEnum("status", ["open", "in_progress", "blocked", "done"]).default("open").notNull(),
  source: varchar("source", { length: 128 }).notNull(),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }).notNull().unique(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const knowledgeSources = mysqlTable("flowos_knowledge_sources", {
  id: varchar("id", { length: 64 }).primaryKey(),
  documentId: varchar("documentId", { length: 64 }).notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  documentVersion: int("documentVersion").default(1).notNull(),
  chunkIndex: int("chunkIndex").notNull(),
  section: varchar("section", { length: 255 }),
  content: text("content").notNull(),
  metadata: text("metadata").notNull(),
  embedding: text("embedding"),
  embeddingModel: varchar("embeddingModel", { length: 128 }),
  embeddingChecksum: varchar("embeddingChecksum", { length: 128 }),
  embeddingStatus: mysqlEnum("embeddingStatus", ["pending", "indexed", "failed"]).default("pending").notNull(),
  embeddingDimensions: int("embeddingDimensions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const agentTraces = mysqlTable("flowos_agent_traces", {
  traceId: varchar("traceId", { length: 64 }).primaryKey(),
  caseId: varchar("caseId", { length: 64 }),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  userId: varchar("userId", { length: 128 }),
  agentName: varchar("agentName", { length: 128 }).notNull(),
  inputReference: text("inputReference").notNull(),
  outputReference: text("outputReference"),
  status: mysqlEnum("status", ["started", "succeeded", "failed", "abstained", "waiting_for_human"]).default("started").notNull(),
  durationMs: int("durationMs"),
  toolAllowlist: text("toolAllowlist").notNull(),
  retryCount: int("retryCount").default(0).notNull(),
  errorCode: varchar("errorCode", { length: 128 }),
  estimatedCostMicros: int("estimatedCostMicros"),
  modelProvider: varchar("modelProvider", { length: 128 }),
  modelName: varchar("modelName", { length: 128 }),
  inputTokens: int("inputTokens"),
  outputTokens: int("outputTokens"),
  retrievalLatencyMs: int("retrievalLatencyMs"),
  llmLatencyMs: int("llmLatencyMs"),
  totalWorkflowLatencyMs: int("totalWorkflowLatencyMs"),
  safetyFlags: text("safetyFlags"),
  humanReviewRequired: int("humanReviewRequired").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const metricObservations = mysqlTable("flowos_metric_observations", {
  id: varchar("id", { length: 64 }).primaryKey(),
  caseId: varchar("caseId", { length: 64 }).notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  metricName: varchar("metricName", { length: 128 }).notNull(),
  value: varchar("value", { length: 128 }).notNull(),
  target: varchar("target", { length: 128 }),
  status: mysqlEnum("status", ["healthy", "warning", "breached"]).default("healthy").notNull(),
  observedAt: timestamp("observedAt").defaultNow().notNull(),
});

export const risks = mysqlTable("flowos_risks", {
  id: varchar("id", { length: 64 }).primaryKey(),
  caseId: varchar("caseId", { length: 64 }).notNull(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
  status: mysqlEnum("status", ["open", "mitigated", "accepted"]).default("open").notNull(),
  mitigation: text("mitigation").notNull(),
  evidenceIds: text("evidenceIds").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const evaluationCases = mysqlTable("flowos_evaluation_cases", {
  id: varchar("id", { length: 64 }).primaryKey(),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  category: varchar("category", { length: 128 }).notNull(),
  expectedBehavior: text("expectedBehavior").notNull(),
  actualBehavior: text("actualBehavior"),
  status: mysqlEnum("status", ["not_run", "passed", "failed"]).default("not_run").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditEvents = mysqlTable("flowos_audit_events", {
  id: varchar("id", { length: 64 }).primaryKey(),
  caseId: varchar("caseId", { length: 64 }),
  tenantKey: varchar("tenantKey", { length: 128 }).default("demo").notNull(),
  userId: varchar("userId", { length: 128 }),
  actor: varchar("actor", { length: 255 }).notNull(),
  actorType: mysqlEnum("actorType", ["human", "agent", "system"]).notNull(),
  eventType: varchar("eventType", { length: 128 }).notNull(),
  oldValue: text("oldValue"),
  newValue: text("newValue"),
  approvalState: varchar("approvalState", { length: 128 }),
  idempotencyKey: varchar("idempotencyKey", { length: 128 }),
  metadata: text("metadata").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Document = typeof documents.$inferSelect;
export type InsertDocument = typeof documents.$inferInsert;
export type OutcomeCase = typeof outcomeCases.$inferSelect;
export type InsertOutcomeCase = typeof outcomeCases.$inferInsert;
export type Evidence = typeof evidence.$inferSelect;
export type InsertEvidence = typeof evidence.$inferInsert;
export type AgentTrace = typeof agentTraces.$inferSelect;
export type InsertAgentTrace = typeof agentTraces.$inferInsert;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type InsertAuditEvent = typeof auditEvents.$inferInsert;
