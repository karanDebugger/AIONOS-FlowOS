import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { COOKIE_NAME } from "@shared/const";
import {
  createAgentTrace,
  createAuditEvent,
  createFlowDocument,
  createOutcomeCase,
  getCaseEvidence,
  getOutcomeCase,
  listAuditEvents,
  listOutcomeCases,
  getFlowDocuments,
  getKnowledgeSources,
  getAllKnowledgeSources,
  listApprovals,
  decideApproval,
  listDependencies,
  listAgentTraces,
  listMetricObservations,
  listWorkItems,
  listRisks,
  listEvaluationCases,
  createEvaluationCase,
} from "./db";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { assertAuthorization } from "./_core/authorization";
import { calculateChecksum, ingestDocument } from "./flowos/ingestion";
import { buildEvidenceResult, retrieveChunks, type KnowledgeChunk, type SourceDocument } from "./flowos/evidence";
import { getWorkflowDetail, runOutcomeWorkflow } from "./flowos/workflow";
import { runEvaluationSuite } from "./flowos/evaluation";
import { getLLMStatus, LLMGatewayError } from "./flowos/llm-gateway";
import { runLiveEvidenceAgent } from "./flowos/llm-agents";
import { storageGetSignedUrl, storagePresignPut } from "./storage";

type EvidenceStatus = "backed" | "inferred" | "missing" | "conflict";

type FlowCase = {
  id: string;
  name: string;
  account: string;
  owner: string;
  deliveryOwner: string;
  status: "Needs decision" | "On track" | "At risk" | "In review";
  readiness: number;
  due: string;
  updated: string;
  blocker: string;
};

const cases: FlowCase[] = [
  { id: "case-001", name: "UniStack partner onboarding", account: "APAC delivery pod", owner: "Maya Chen", deliveryOwner: "Arjun Nair", status: "Needs decision", readiness: 68, due: "24 Sep", updated: "12 min ago", blocker: "Okta service account owner is missing" },
  { id: "case-002", name: "Airport ops incident copilot", account: "Global aviation", owner: "Sofia Rahman", deliveryOwner: "Liam Wong", status: "At risk", readiness: 54, due: "27 Sep", updated: "41 min ago", blocker: "Runbook evidence is stale" },
  { id: "case-003", name: "BFSI KYC workflow redesign", account: "Enterprise transformation", owner: "David Tan", deliveryOwner: "Nikhil Rao", status: "In review", readiness: 81, due: "02 Oct", updated: "2 hr ago", blocker: "Human approval boundary under review" },
  { id: "case-004", name: "Hotel workforce knowledge layer", account: "Hospitality practice", owner: "Jia Wei", deliveryOwner: "Marta Ruiz", status: "On track", readiness: 93, due: "08 Oct", updated: "Yesterday", blocker: "No active blockers" },
];

function authorize(ctx: { user: import("../drizzle/schema").User | null }, permission: Parameters<typeof assertAuthorization>[0]["permission"], tenantKey?: string) {
  return assertAuthorization({ user: ctx.user, tenantKey, permission, allowDemo: true });
}

const dashboard = {
  cases,
  selectedCaseId: "case-001",
  kpis: { activeHandoffs: 14, activeHandoffsDelta: "+3 this week", criticalBlockers: 3, evidenceCoverage: 92, approvalLatency: "1.8d" },
  evidence: [
    { id: "ev-01", field: "Business outcome", value: "Reduce partner onboarding cycle time from 12 days to 4 days", status: "backed" as EvidenceStatus, confidence: 98, source: "Opportunity brief · p.2", excerpt: "The first release must reduce time-to-ready for new delivery partners..." },
    { id: "ev-02", field: "Systems of record", value: "Okta, Jira, SharePoint, Google Workspace", status: "backed" as EvidenceStatus, confidence: 94, source: "Solution design · §3", excerpt: "Identity and work management remain authoritative in existing systems..." },
    { id: "ev-03", field: "Access owner", value: "No accountable owner found for Okta service account", status: "missing" as EvidenceStatus, confidence: 100, source: "Readiness scan · 12 min ago", excerpt: "The access prerequisite exists, but the responsible data owner is not named." },
    { id: "ev-04", field: "Launch SLO", value: "Proposed: 99.5% workflow availability, p95 < 90s", status: "inferred" as EvidenceStatus, confidence: 72, source: "Agent recommendation · draft", excerpt: "No approved production SLO was present. This is a bounded proposal for review." },
    { id: "ev-05", field: "Policy alignment", value: "Two sources disagree on external partner data retention", status: "conflict" as EvidenceStatus, confidence: 91, source: "Policy ledger · 2 sources", excerpt: "The 30-day and 90-day retention rules cannot be reconciled automatically." },
  ],
  dependencies: [
    { id: "dep-01", label: "Outcome & scope locked", owner: "Maya Chen", state: "complete", eta: "Done", note: "Promise and exclusions are source-backed." },
    { id: "dep-02", label: "Okta service account approval", owner: "Unassigned", state: "blocked", eta: "Critical path", note: "Without the account, integration testing cannot begin." },
    { id: "dep-03", label: "Connector contract test", owner: "Arjun Nair", state: "waiting", eta: "After dep-02", note: "Jira and SharePoint fixtures are ready." },
    { id: "dep-04", label: "Security review", owner: "Priya Menon", state: "waiting", eta: "After dep-03", note: "Data classification is low-risk, pending retention decision." },
    { id: "dep-05", label: "Pilot handoff approval", owner: "Maya Chen", state: "waiting", eta: "After dep-04", note: "Human gate before any customer-facing commitment." },
  ],
  approvals: [
    { id: "ap-01", title: "Confirm missing Okta access owner", type: "Access decision", owner: "Maya Chen", age: "18h", priority: "High", status: "Pending" },
    { id: "ap-02", title: "Resolve retention policy conflict", type: "Policy exception", owner: "Priya Menon", age: "7h", priority: "High", status: "Pending" },
    { id: "ap-03", title: "Approve proposed launch SLO", type: "Run-state gate", owner: "Arjun Nair", age: "2h", priority: "Medium", status: "Pending" },
  ],
  runState: [
    { label: "Evidence coverage", value: 92, display: "92%", tone: "good" },
    { label: "Owner completeness", value: 71, display: "71%", tone: "warn" },
    { label: "SLO telemetry", value: 38, display: "Not live", tone: "critical" },
  ],
  activity: [
    { time: "12 min ago", actor: "Readiness Agent", action: "flagged an unowned access prerequisite", tone: "critical" },
    { time: "28 min ago", actor: "Evidence Agent", action: "linked 4 passages to the handoff packet", tone: "good" },
    { time: "1 hr ago", actor: "Maya Chen", action: "edited the outcome statement", tone: "neutral" },
    { time: "2 hr ago", actor: "Policy Agent", action: "paused autonomous routing on a conflict", tone: "warn" },
  ],
};

const caseInput = z.object({
  id: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(255),
  outcomeStatement: z.string().min(1),
  businessOwner: z.string().max(255).optional(),
  deliveryOwner: z.string().max(255).optional(),
  scope: z.string().min(1),
  exclusions: z.string().min(1),
  systemsOfRecord: z.string().min(1),
  dataOwners: z.string().min(1),
  accessPrerequisites: z.string().min(1),
  dependencies: z.string().min(1),
  acceptanceCriteria: z.string().min(1),
  riskLevel: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  humanApprovers: z.string().min(1),
  slos: z.string().min(1),
  launchGate: z.string().min(1),
  runStateOwner: z.string().max(255).optional(),
  sourceCitations: z.string().min(1),
  tenantKey: z.string().max(128).default("demo"),
});

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  flowos: router({
    dashboard: publicProcedure.query(({ ctx }) => { authorize(ctx, "cases.view"); return dashboard; }),
    llmStatus: publicProcedure.query(() => getLLMStatus()),
    securityContext: publicProcedure.query(({ ctx }) => { const identity = authorize(ctx, "cases.view"); return { ...identity, authenticated: Boolean(ctx.user), permissions: ["cases.view", "evidence.query", ...(identity.role === "operator" || identity.role === "admin" ? ["cases.create", "documents.upload", "agents.execute"] : []), ...(identity.role === "reviewer" || identity.role === "admin" ? ["approvals.decide"] : [])] }; }),
    persistedCases: publicProcedure.input(z.object({ tenantKey: z.string().optional() }).optional()).query(({ input, ctx }) => { const identity = authorize(ctx, "cases.view", input?.tenantKey); return listOutcomeCases(identity.tenantKey); }),
    caseDetail: publicProcedure.input(z.object({ caseId: z.string().min(1) })).query(async ({ input, ctx }) => {
      const identity = authorize(ctx, "cases.view");
      const outcomeCase = await getOutcomeCase(input.caseId, identity.tenantKey);
      if (!outcomeCase) return null;
      const [caseEvidence, audit] = await Promise.all([getCaseEvidence(input.caseId, identity.tenantKey), listAuditEvents(input.caseId, identity.tenantKey)]);
      if (outcomeCase.tenantKey !== identity.tenantKey) throw new TRPCError({ code: "FORBIDDEN", message: "Cross-tenant access denied." });
      return { outcomeCase, evidence: caseEvidence, audit };
    }),
    createCase: publicProcedure.input(caseInput).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "cases.create", input.tenantKey);
      const id = input.id ?? `case-${nanoid(10)}`;
      const created = await createOutcomeCase({ ...input, tenantKey: identity.tenantKey, id, status: "intake", readinessStatus: "needs_human_review" });
      await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId: id, actor: "FlowOS user", actorType: "human", eventType: "CASE_CREATED", oldValue: null, newValue: JSON.stringify({ id, name: input.name }), approvalState: "not_required", idempotencyKey: `case-created-${id}`, metadata: JSON.stringify({ source: "flowos.createCase" }) });
      return { success: true, case: created };
    }),
    documents: publicProcedure.query(({ ctx }) => { const identity = authorize(ctx, "cases.view"); return getFlowDocuments(identity.tenantKey); }),
    documentChunks: publicProcedure.input(z.object({ documentId: z.string().min(1) })).query(({ input, ctx }) => { const identity = authorize(ctx, "evidence.query"); return getKnowledgeSources(input.documentId, identity.tenantKey); }),
    retrieveEvidence: publicProcedure.input(z.object({ query: z.string().min(2).max(500), limit: z.number().int().min(1).max(20).default(6), accessClassification: z.enum(["public", "internal", "confidential", "restricted"]).optional() })).query(async ({ input, ctx }) => {
      const identity = authorize(ctx, "evidence.query");
      const [rawChunks, rawDocuments] = await Promise.all([getAllKnowledgeSources(identity.tenantKey), getFlowDocuments(identity.tenantKey)]);
      const hits = retrieveChunks(input.query, rawChunks as KnowledgeChunk[], rawDocuments as SourceDocument[], input.limit, input.accessClassification, identity.tenantKey);
      return buildEvidenceResult(input.query, hits);
    }),
    evidenceAgent: publicProcedure.input(z.object({ query: z.string().min(2).max(500), limit: z.number().int().min(1).max(20).default(6), accessClassification: z.enum(["public", "internal", "confidential", "restricted"]).optional(), caseId: z.string().max(64).optional(), actor: z.string().max(128).default("Evidence Agent") })).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "agents.execute");
      const traceId = `trace-${nanoid(10)}`;
      const startedAt = Date.now();
      const [rawChunks, rawDocuments] = await Promise.all([getAllKnowledgeSources(identity.tenantKey), getFlowDocuments(identity.tenantKey)]);
      const hits = retrieveChunks(input.query, rawChunks as KnowledgeChunk[], rawDocuments as SourceDocument[], input.limit, input.accessClassification, identity.tenantKey);
      const deterministic = buildEvidenceResult(input.query, hits);
      let result: typeof deterministic & { mode?: string; usage?: unknown; reasoningSummary?: string };
      if (getLLMStatus().mode === "LIVE_LLM") {
        try { const live = await runLiveEvidenceAgent({ query: input.query, citations: deterministic.citations });
          result = { ...deterministic, status: live.status === "INFERRED" ? "SOURCE_BACKED" : live.status, answer: live.answer, confidence: live.confidence, reason: live.reasoningSummary, abstained: live.status === "MISSING" || live.status === "CONFLICTING", guardrail: live.guardrail, mode: live.mode, usage: live.usage, reasoningSummary: live.reasoningSummary }; } catch (error) {
          await createAgentTrace({ traceId, caseId: input.caseId, tenantKey: identity.tenantKey, userId: identity.userId, agentName: "Evidence Agent", inputReference: input.query, outputReference: null, status: "failed", durationMs: Date.now() - startedAt, toolAllowlist: JSON.stringify(["knowledge_source_search", "citation_reader"]), retryCount: 1, errorCode: error instanceof LLMGatewayError ? error.code : "AGENT_UNAVAILABLE", estimatedCostMicros: null, modelProvider: getLLMStatus().provider, modelName: getLLMStatus().model, safetyFlags: JSON.stringify(["fail_closed"]), humanReviewRequired: 1 });
          throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: error instanceof Error ? error.message : "LLM provider unavailable." });
        }
      } else { result = { ...deterministic, mode: "DETERMINISTIC_DEMO_MODE", reasoningSummary: "Deterministic demo retrieval used because no live provider is configured." }; }
      await createAgentTrace({ traceId, caseId: input.caseId, tenantKey: identity.tenantKey, userId: identity.userId, agentName: "Evidence Agent", inputReference: input.query, outputReference: JSON.stringify({ status: result.status, citationCount: result.citations.length }), status: result.abstained ? "abstained" : "succeeded", durationMs: Date.now() - startedAt, toolAllowlist: JSON.stringify(["knowledge_source_search", "citation_reader"]), retryCount: 0, estimatedCostMicros: result.usage && typeof result.usage === "object" && "estimatedCostMicros" in result.usage ? (result.usage as { estimatedCostMicros?: number | null }).estimatedCostMicros : 0, modelProvider: getLLMStatus().provider, modelName: getLLMStatus().model, safetyFlags: JSON.stringify([result.guardrail]), humanReviewRequired: result.abstained ? 1 : 0 });
      await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId: input.caseId, actor: input.actor, actorType: "agent", eventType: result.abstained ? "EVIDENCE_ABSTAINED" : "EVIDENCE_RETRIEVED", oldValue: null, newValue: JSON.stringify({ query: input.query, status: result.status, confidence: result.confidence }), approvalState: result.abstained ? "human_required" : "not_required", idempotencyKey: `evidence-${traceId}`, metadata: JSON.stringify({ traceId, citationCount: result.citations.length, guardrail: result.guardrail }) });
      return { ...result, traceId };
    }),
    runWorkflow: publicProcedure.input(z.object({ documentId: z.string().min(1).max(64), actor: z.string().min(1).max(128).default("Maya Chen"), caseName: z.string().max(255).optional(), tenantKey: z.string().max(128).default("demo") })).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "agents.execute", input.tenantKey);
      try {
        return await runOutcomeWorkflow({ ...input, tenantKey: identity.tenantKey, userId: identity.userId, actor: ctx.user?.name ?? input.actor });
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Workflow execution failed" });
      }
    }),
    workflowDetail: publicProcedure.input(z.object({ caseId: z.string().min(1).max(64) })).query(({ input, ctx }) => { authorize(ctx, "cases.view"); return getWorkflowDetail(input.caseId, authorize(ctx, "cases.view").tenantKey); }),
    approvals: publicProcedure.input(z.object({ caseId: z.string().max(64).optional() }).optional()).query(({ input, ctx }) => { authorize(ctx, "cases.view"); const identity = authorize(ctx, "cases.view"); return listApprovals(input?.caseId, identity.tenantKey); }),
    decideApproval: publicProcedure.input(z.object({ approvalId: z.string().min(1).max(64), decision: z.enum(["approved", "rejected", "changes_requested", "escalated"]), actor: z.string().min(1).max(128).default("Maya Chen"), caseId: z.string().max(64).optional() })).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "approvals.decide");
      const approval = await decideApproval(input.approvalId, input.decision);
      await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId: input.caseId, tenantKey: identity.tenantKey, userId: identity.userId, actor: ctx.user?.name ?? input.actor, actorType: "human", eventType: "APPROVAL_DECISION", oldValue: "pending", newValue: input.decision, approvalState: input.decision === "approved" ? "approved" : "human_required", idempotencyKey: `approval-decision-${input.approvalId}-${input.decision}`, metadata: JSON.stringify({ approvalId: input.approvalId, protectedBoundary: true }) });
      return { success: true, approval };
    }),
    dependencies: publicProcedure.input(z.object({ caseId: z.string().min(1).max(64) })).query(({ input, ctx }) => { authorize(ctx, "cases.view"); const identity = authorize(ctx, "cases.view"); return listDependencies(input.caseId, identity.tenantKey); }),
    traces: publicProcedure.input(z.object({ caseId: z.string().max(64).optional() }).optional()).query(({ input, ctx }) => { authorize(ctx, "audit.view"); const identity = authorize(ctx, "audit.view"); return listAgentTraces(input?.caseId, identity.tenantKey); }),
    telemetry: publicProcedure.input(z.object({ caseId: z.string().min(1).max(64) })).query(({ input, ctx }) => { authorize(ctx, "cases.view"); const identity = authorize(ctx, "cases.view"); return listMetricObservations(input.caseId, identity.tenantKey); }),
    workItems: publicProcedure.input(z.object({ caseId: z.string().min(1).max(64) })).query(({ input, ctx }) => { authorize(ctx, "cases.view"); const identity = authorize(ctx, "cases.view"); return listWorkItems(input.caseId, identity.tenantKey); }),
    risks: publicProcedure.input(z.object({ caseId: z.string().min(1).max(64) })).query(({ input, ctx }) => { authorize(ctx, "cases.view"); const identity = authorize(ctx, "cases.view"); return listRisks(input.caseId, identity.tenantKey); }),
    auditTrail: publicProcedure.input(z.object({ caseId: z.string().max(64).optional() }).optional()).query(({ input, ctx }) => { authorize(ctx, "audit.view"); const identity = authorize(ctx, "audit.view"); return listAuditEvents(input?.caseId, identity.tenantKey); }),
    handoffPacket: publicProcedure.input(z.object({ caseId: z.string().min(1).max(64) })).query(async ({ input, ctx }) => {
      authorize(ctx, "cases.view");
      const identity = authorize(ctx, "cases.view");
      const detail = await getWorkflowDetail(input.caseId, identity.tenantKey);
      if (!detail) return null;
      return { caseId: input.caseId, status: detail.approvals.some((approval) => approval.decision === "pending") ? "WAITING_FOR_APPROVAL" : "PREPARED", packet: { outcome: detail.outcomeCase.outcomeStatement, scope: detail.outcomeCase.scope, exclusions: detail.outcomeCase.exclusions, owners: { business: detail.outcomeCase.businessOwner, delivery: detail.outcomeCase.deliveryOwner }, systems: detail.outcomeCase.systemsOfRecord, evidence: detail.evidence, dependencies: detail.dependencies, approvals: detail.approvals, risks: detail.risks, metrics: detail.metrics, launchGate: detail.outcomeCase.launchGate, supportOwner: detail.outcomeCase.runStateOwner } };
    }),
    evaluationSuite: publicProcedure.query(({ ctx }) => { authorize(ctx, "evaluations.view"); return runEvaluationSuite(); }),
    runEvaluation: publicProcedure.mutation(async ({ ctx }) => {
      const identity = authorize(ctx, "evaluations.view");
      const suite = runEvaluationSuite();
      for (const item of suite.cases) await createEvaluationCase({ tenantKey: identity.tenantKey, id: item.id, name: item.name, category: item.category, expectedBehavior: item.expectedBehavior, actualBehavior: item.actualBehavior, status: item.status });
      await createAuditEvent({ id: `audit-${nanoid(10)}`, tenantKey: identity.tenantKey, userId: identity.userId, actor: "Evaluation System", actorType: "system", eventType: "EVALUATION_RUN", oldValue: null, newValue: JSON.stringify(suite.summary), approvalState: "not_required", idempotencyKey: suite.runId, metadata: JSON.stringify({ cases: suite.cases.length }) });
      return suite;
    }),
    evaluations: publicProcedure.query(({ ctx }) => { authorize(ctx, "evaluations.view"); const identity = authorize(ctx, "evaluations.view"); return listEvaluationCases(identity.tenantKey); }),
    registerDocument: publicProcedure.input(z.object({ filename: z.string().min(1).max(255), documentType: z.enum(["opportunity_brief", "statement_of_work", "discovery_notes", "architecture", "use_case_request"]), uploadedBy: z.string().min(1).max(128), source: z.string().min(1).max(255), department: z.string().min(1).max(128), accessClassification: z.enum(["public", "internal", "confidential", "restricted"]).default("internal"), checksum: z.string().min(1).max(128), storageKey: z.string().max(512).optional() })).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "documents.upload");
      const document = await createFlowDocument({ ...input, tenantKey: identity.tenantKey, id: `doc-${nanoid(10)}`, version: 1, processingStatus: "uploaded" });
      await createAuditEvent({ id: `audit-${nanoid(10)}`, actor: input.uploadedBy, actorType: "human", eventType: "DOCUMENT_REGISTERED", oldValue: null, newValue: JSON.stringify({ filename: input.filename }), approvalState: "not_required", idempotencyKey: `document-${input.checksum}`, metadata: JSON.stringify({ source: "flowos.registerDocument" }) });
      return { success: true, document };
    }),
    beginDocumentUpload: publicProcedure.input(z.object({ filename: z.string().min(1).max(255), contentType: z.string().min(1).max(128), byteLength: z.number().int().positive().max(15 * 1024 * 1024) })).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "documents.upload");
      const safeName = input.filename.replace(/[^a-zA-Z0-9._-]/g, "-");
      const key = `flowos/direct/${identity.tenantKey}/${nanoid(12)}-${safeName}`;
      const presigned = await storagePresignPut(key);
      return { ...presigned, tenantKey: identity.tenantKey, expiresInSeconds: 900, maxBytes: 15 * 1024 * 1024 };
    }),
    completeDocumentUpload: publicProcedure.input(z.object({ filename: z.string().min(1).max(255), contentType: z.string().min(1).max(128), storageKey: z.string().min(1).max(512), checksum: z.string().min(32).max(128), byteLength: z.number().int().positive().max(15 * 1024 * 1024), uploadedBy: z.string().min(1).max(128), documentType: z.enum(["opportunity_brief", "statement_of_work", "discovery_notes", "architecture", "use_case_request"]), source: z.string().min(1).max(255).default("flowos-direct-upload"), department: z.string().min(1).max(128), accessClassification: z.enum(["public", "internal", "confidential", "restricted"]).default("internal") })).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "documents.upload");
      if (!input.storageKey.startsWith(`flowos/direct/${identity.tenantKey}/`)) throw new TRPCError({ code: "FORBIDDEN", message: "Storage key is not scoped to the active tenant." });
      try {
        const signedUrl = await storageGetSignedUrl(input.storageKey);
        const response = await fetch(signedUrl);
        if (!response.ok) throw new Error(`Stored object fetch failed (${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        if (bytes.length !== input.byteLength) throw new Error("Stored object length does not match the completion claim.");
        const actualChecksum = calculateChecksum(bytes);
        if (actualChecksum !== input.checksum) throw new Error("Stored object checksum does not match the completion claim.");
        const result = await ingestDocument({ ...input, tenantKey: identity.tenantKey, storageKey: input.storageKey, uploadedBy: ctx.user?.name ?? input.uploadedBy, bytes });
        await createAuditEvent({ id: `audit-${nanoid(10)}`, tenantKey: identity.tenantKey, userId: identity.userId, actor: ctx.user?.name ?? input.uploadedBy, actorType: "human", eventType: "DOCUMENT_INDEXED", oldValue: "uploaded_direct", newValue: "indexed", approvalState: "not_required", idempotencyKey: `direct-document-indexed-${result.checksum}`, metadata: JSON.stringify({ documentId: result.document.id, storageKey: input.storageKey, pages: result.pages, chunks: result.chunks }) });
        return { success: true, ...result };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Direct document ingestion failed" });
      }
    }),
    uploadDocument: publicProcedure.input(z.object({
      filename: z.string().min(1).max(255),
      contentType: z.string().min(1).max(128),
      contentBase64: z.string().min(1).max(22_000_000),
      uploadedBy: z.string().min(1).max(128),
      documentType: z.enum(["opportunity_brief", "statement_of_work", "discovery_notes", "architecture", "use_case_request"]),
      source: z.string().min(1).max(255).default("flowos-upload"),
      department: z.string().min(1).max(128),
      accessClassification: z.enum(["public", "internal", "confidential", "restricted"]).default("internal"),
    })).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "documents.upload");
      const encoded = input.contentBase64.includes(",") ? input.contentBase64.split(",", 2)[1] : input.contentBase64;
      if (!encoded) throw new TRPCError({ code: "BAD_REQUEST", message: "Document payload is empty" });
      let bytes: Buffer;
      try {
        bytes = Buffer.from(encoded, "base64");
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Document payload is not valid base64" });
      }
      try {
        const result = await ingestDocument({ ...input, tenantKey: identity.tenantKey, uploadedBy: ctx.user?.name ?? input.uploadedBy, bytes });
        await createAuditEvent({ id: `audit-${nanoid(10)}`, actor: input.uploadedBy, actorType: "human", eventType: "DOCUMENT_INDEXED", oldValue: "uploaded", newValue: "indexed", approvalState: "not_required", idempotencyKey: `document-indexed-${result.checksum}`, metadata: JSON.stringify({ documentId: result.document.id, pages: result.pages, chunks: result.chunks }) });
        return { success: true, ...result };
      } catch (error) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error instanceof Error ? error.message : "Document ingestion failed" });
      }
    }),
    approve: publicProcedure.input(z.object({ approvalId: z.string(), caseId: z.string().optional(), actor: z.string().default("Maya Chen") })).mutation(async ({ input, ctx }) => {
      const identity = authorize(ctx, "approvals.decide");
      await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId: input.caseId, tenantKey: identity.tenantKey, userId: identity.userId, actor: ctx.user?.name ?? input.actor, actorType: "human", eventType: "APPROVAL_RECORDED", oldValue: "pending", newValue: "approved", approvalState: "approved", idempotencyKey: `approval-${input.approvalId}-approved`, metadata: JSON.stringify({ approvalId: input.approvalId, scopeChanged: false }) });
      return { success: true, approvalId: input.approvalId, message: "Approval recorded. Scope remains unchanged until the next human gate." };
    }),
    simulateRun: publicProcedure.mutation(async ({ ctx }) => {
      const identity = authorize(ctx, "agents.execute");
      const traceId = `trace-${nanoid(10)}`;
      const timestamp = new Date().toISOString();
      await createAgentTrace({ traceId, caseId: "case-001", tenantKey: identity.tenantKey, userId: identity.userId, agentName: "Run-State Agent", inputReference: "synthetic.connector_failure", outputReference: "safe_retry.blocker_visible", status: "succeeded", durationMs: 420, toolAllowlist: JSON.stringify(["connector_health_check", "work_item_create", "notification"]), retryCount: 1, estimatedCostMicros: 1800 });
      await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId: "case-001", actor: "Run-State Agent", actorType: "agent", eventType: "SAFE_RETRY_COMPLETED", oldValue: "connector_failed", newValue: "blocker_routed", approvalState: "human_required", idempotencyKey: `retry-case-001-connector-v1`, metadata: JSON.stringify({ retryCount: 1, duplicatePrevented: true }) });
      return { success: true, event: "Connector retry completed safely; blocker remains visible and routed to the owner.", timestamp, traceId };
    }),
  }),
});

export type AppRouter = typeof appRouter;
