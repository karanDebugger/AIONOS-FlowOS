import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  AuditEvent,
  InsertAuditEvent,
  InsertDocument,
  InsertEvidence,
  InsertOutcomeCase,
  agentTraces,
  approvals,
  dependencies,
  workItems,
  metricObservations,
  risks,
  evaluationCases,
  auditEvents,
  documents,
  evidence,
  knowledgeSources,
  outcomeCases,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: typeof users.$inferInsert): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }
  const values: typeof users.$inferInsert = { openId: user.openId };
  const updateSet: Record<string, unknown> = {};
  const textFields = ["name", "email", "loginMethod"] as const;
  for (const field of textFields) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  if (user.lastSignedIn !== undefined) {
    values.lastSignedIn = user.lastSignedIn;
    updateSet.lastSignedIn = user.lastSignedIn;
  }
  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }
  values.lastSignedIn ??= new Date();
  if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function findDocumentByChecksum(checksum: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(and(eq(documents.checksum, checksum), eq(documents.tenantKey, tenantKey))).orderBy(desc(documents.version)).limit(1);
  return result[0];
}

export async function findLatestDocumentVersion(filename: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(documents).where(and(eq(documents.filename, filename), eq(documents.tenantKey, tenantKey))).orderBy(desc(documents.version)).limit(1);
  return result[0];
}

export async function createFlowDocument(document: InsertDocument) {
  const db = await getDb();
  if (!db) return document;
  await db.insert(documents).values(document);
  return document;
}

export async function updateFlowDocument(
  id: string,
  values: Partial<Pick<InsertDocument, "storageKey" | "processingStatus" | "version">>,
) {
  const db = await getDb();
  if (!db) return { id, ...values };
  await db.update(documents).set(values).where(eq(documents.id, id));
  const result = await db.select().from(documents).where(eq(documents.id, id)).limit(1);
  return result[0] ?? { id, ...values };
}

export async function getFlowDocuments(tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(documents).where(eq(documents.tenantKey, tenantKey)).orderBy(desc(documents.createdAt));
}

export async function createKnowledgeSources(items: Array<typeof knowledgeSources.$inferInsert>) {
  const db = await getDb();
  if (!db || items.length === 0) return items;
  await db.insert(knowledgeSources).values(items);
  return items;
}

export async function getKnowledgeSources(documentId: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(knowledgeSources).where(and(eq(knowledgeSources.documentId, documentId), eq(knowledgeSources.tenantKey, tenantKey))).orderBy(knowledgeSources.chunkIndex);
}

export async function createOutcomeCase(outcomeCase: InsertOutcomeCase) {
  const db = await getDb();
  if (!db) return outcomeCase;
  await db.insert(outcomeCases).values(outcomeCase);
  return outcomeCase;
}

export async function getOutcomeCase(id: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(outcomeCases).where(and(eq(outcomeCases.id, id), eq(outcomeCases.tenantKey, tenantKey))).limit(1);
  return result[0];
}

export async function listOutcomeCases(tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(outcomeCases).where(eq(outcomeCases.tenantKey, tenantKey)).orderBy(desc(outcomeCases.updatedAt));
}

export async function createEvidence(items: InsertEvidence[]) {
  const db = await getDb();
  if (!db || items.length === 0) return items;
  await db.insert(evidence).values(items);
  return items;
}

export async function getCaseEvidence(caseId: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(evidence).where(and(eq(evidence.caseId, caseId), eq(evidence.tenantKey, tenantKey))).orderBy(desc(evidence.retrievedAt));
}

export async function createAgentTrace(trace: typeof agentTraces.$inferInsert) {
  const db = await getDb();
  if (!db) return trace;
  await db.insert(agentTraces).values(trace);
  return trace;
}

export async function createAuditEvent(event: InsertAuditEvent): Promise<AuditEvent | InsertAuditEvent> {
  const db = await getDb();
  if (!db) return event;
  await db.insert(auditEvents).values(event);
  const result = await db.select().from(auditEvents).where(eq(auditEvents.id, event.id)).limit(1);
  return result[0] ?? event;
}

export async function listAuditEvents(caseId?: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  if (caseId) return db.select().from(auditEvents).where(and(eq(auditEvents.caseId, caseId), eq(auditEvents.tenantKey, tenantKey))).orderBy(desc(auditEvents.createdAt));
  return db.select().from(auditEvents).where(eq(auditEvents.tenantKey, tenantKey)).orderBy(desc(auditEvents.createdAt));
}

export async function getAllKnowledgeSources(tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(knowledgeSources).where(eq(knowledgeSources.tenantKey, tenantKey)).orderBy(desc(knowledgeSources.createdAt));
}


export async function updateOutcomeCase(id: string, values: Partial<typeof outcomeCases.$inferInsert>) {
  const db = await getDb();
  if (!db) return { id, ...values };
  await db.update(outcomeCases).set(values).where(eq(outcomeCases.id, id));
  const result = await db.select().from(outcomeCases).where(eq(outcomeCases.id, id)).limit(1);
  return result[0] ?? { id, ...values };
}

export async function createDependencies(items: Array<typeof dependencies.$inferInsert>) {
  const db = await getDb();
  if (!db || items.length === 0) return items;
  await db.insert(dependencies).values(items);
  return items;
}

export async function listDependencies(caseId: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(dependencies).where(and(eq(dependencies.caseId, caseId), eq(dependencies.tenantKey, tenantKey))).orderBy(dependencies.createdAt);
}

export async function createApproval(approval: typeof approvals.$inferInsert) {
  const db = await getDb();
  if (!db) return approval;
  await db.insert(approvals).values(approval);
  return approval;
}

export async function listApprovals(caseId?: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  if (caseId) return db.select().from(approvals).where(and(eq(approvals.caseId, caseId), eq(approvals.tenantKey, tenantKey))).orderBy(desc(approvals.createdAt));
  return db.select().from(approvals).where(eq(approvals.tenantKey, tenantKey)).orderBy(desc(approvals.createdAt));
}

export async function decideApproval(id: string, decision: "approved" | "rejected" | "changes_requested" | "escalated") {
  const db = await getDb();
  if (!db) return { id, decision, decidedAt: new Date() };
  await db.update(approvals).set({ decision, decidedAt: new Date() }).where(eq(approvals.id, id));
  const result = await db.select().from(approvals).where(eq(approvals.id, id)).limit(1);
  return result[0] ?? { id, decision, decidedAt: new Date() };
}

export async function createWorkItem(item: typeof workItems.$inferInsert) {
  const db = await getDb();
  if (!db) return item;
  await db.insert(workItems).values(item);
  return item;
}

export async function listWorkItems(caseId: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(workItems).where(and(eq(workItems.caseId, caseId), eq(workItems.tenantKey, tenantKey))).orderBy(desc(workItems.createdAt));
}

export async function createMetricObservation(item: typeof metricObservations.$inferInsert) {
  const db = await getDb();
  if (!db) return item;
  await db.insert(metricObservations).values(item);
  return item;
}

export async function listMetricObservations(caseId: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(metricObservations).where(and(eq(metricObservations.caseId, caseId), eq(metricObservations.tenantKey, tenantKey))).orderBy(desc(metricObservations.observedAt));
}

export async function createRisk(item: typeof risks.$inferInsert) {
  const db = await getDb();
  if (!db) return item;
  await db.insert(risks).values(item);
  return item;
}

export async function listRisks(caseId: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(risks).where(and(eq(risks.caseId, caseId), eq(risks.tenantKey, tenantKey))).orderBy(desc(risks.createdAt));
}

export async function createEvaluationCase(item: typeof evaluationCases.$inferInsert) {
  const db = await getDb();
  if (!db) return item;
  await db.insert(evaluationCases).values(item);
  return item;
}

export async function listEvaluationCases(tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(evaluationCases).where(eq(evaluationCases.tenantKey, tenantKey)).orderBy(desc(evaluationCases.createdAt));
}

export async function listAgentTraces(caseId?: string, tenantKey = "demo") {
  const db = await getDb();
  if (!db) return [];
  if (caseId) return db.select().from(agentTraces).where(and(eq(agentTraces.caseId, caseId), eq(agentTraces.tenantKey, tenantKey))).orderBy(desc(agentTraces.createdAt));
  return db.select().from(agentTraces).where(eq(agentTraces.tenantKey, tenantKey)).orderBy(desc(agentTraces.createdAt));
}
