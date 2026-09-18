import { nanoid } from "nanoid";
import {
  createAgentTrace,
  createApproval,
  createAuditEvent,
  createDependencies,
  createEvidence,
  createMetricObservation,
  createOutcomeCase,
  createWorkItem,
  createRisk,
  getCaseEvidence,
  getFlowDocuments,
  getKnowledgeSources,
  getOutcomeCase,
  listApprovals,
  listDependencies,
  listMetricObservations,
  listRisks,
  listWorkItems,
  updateOutcomeCase,
} from "../db";
import { buildEvidenceResult, retrieveChunks, type KnowledgeChunk, type SourceDocument } from "./evidence";
import { getLLMStatus } from "./llm-gateway";
import { runLiveIntakeAgent } from "./llm-agents";

type FieldStatus = "SOURCE_BACKED" | "INFERRED" | "MISSING" | "CONFLICTING";
type ReadinessStatus = "READY" | "BLOCKED" | "NEEDS_HUMAN_REVIEW";

type AgentSpec = {
  name: string;
  responsibility: string;
  tools: string[];
  timeoutMs: number;
  retryPolicy: string;
  confidenceThreshold: number;
};

export const agentSpecs: AgentSpec[] = [
  { name: "Intake Agent", responsibility: "Extract a typed OutcomeCase draft without inventing missing business facts.", tools: ["knowledge_source_search", "document_reader"], timeoutMs: 8000, retryPolicy: "one bounded retry; no external side effects", confidenceThreshold: 0.6 },
  { name: "Evidence Agent", responsibility: "Attach cited passages and classify each claim.", tools: ["knowledge_source_search", "citation_reader"], timeoutMs: 8000, retryPolicy: "one bounded retry; abstain on failure", confidenceThreshold: 0.16 },
  { name: "Readiness Agent", responsibility: "Evaluate delivery readiness and produce explainable blockers.", tools: ["case_lookup", "evidence_lookup"], timeoutMs: 5000, retryPolicy: "none; route for review", confidenceThreshold: 0.7 },
  { name: "Dependency Agent", responsibility: "Build the directed critical-path graph and impact analysis.", tools: ["case_lookup", "dependency_lookup"], timeoutMs: 5000, retryPolicy: "none; preserve graph state", confidenceThreshold: 0.7 },
  { name: "Policy Agent", responsibility: "Detect policy conflict and enforce human approval boundaries.", tools: ["document_search", "policy_lookup", "approval_create"], timeoutMs: 5000, retryPolicy: "none; stop autonomous routing", confidenceThreshold: 0.9 },
  { name: "Handoff Agent", responsibility: "Prepare a structured delivery packet; never approve or commit externally.", tools: ["case_lookup", "evidence_lookup", "approval_lookup"], timeoutMs: 5000, retryPolicy: "none; prepare only", confidenceThreshold: 0.8 },
  { name: "Run-State Agent", responsibility: "Monitor simulated telemetry and create visible operational events.", tools: ["telemetry_lookup", "connector_health_check", "work_item_create", "notification"], timeoutMs: 5000, retryPolicy: "one idempotent retry", confidenceThreshold: 0.8 },
];

const missingValue = "MISSING — human input required";

function valueAfterLabel(text: string, labels: string[]) {
  for (const label of labels) {
    const match = text.match(new RegExp(`${label}\\s*[:\\-]\\s*(.+)`, "i"));
    if (match?.[1]) return match[1].split(/[\n.;]/, 1)[0]!.trim();
  }
  return "";
}

function statusFor(value: string, conflicting = false): FieldStatus {
  if (conflicting) return "CONFLICTING";
  return value ? "SOURCE_BACKED" : "MISSING";
}

function citationFor(hit: { chunk: KnowledgeChunk; document: SourceDocument; metadata: Record<string, unknown>; score: number; safetyFlags?: string[] }) {
  return {
    sourceDocument: hit.document.filename,
    documentId: hit.document.id,
    documentVersion: hit.document.version,
    page: typeof hit.metadata.page === "number" ? hit.metadata.page : null,
    section: hit.chunk.section,
    chunkId: hit.chunk.id,
    passage: hit.chunk.content,
    relevanceScore: Math.round(hit.score * 100),
    retrievedAt: new Date().toISOString(),
    safetyFlags: hit.safetyFlags ?? [],
  };
}

function fieldValue(field: string, passage: string) {
  const labels: Record<string, string[]> = {
    outcomeStatement: ["outcome", "business outcome", "objective", "goal"],
    scope: ["scope", "in scope"],
    exclusions: ["exclusions", "out of scope"],
    systemsOfRecord: ["systems of record", "systems", "source systems"],
    dataOwners: ["data owners", "data owner"],
    accessPrerequisites: ["access prerequisites", "access approval", "api approval", "access"],
    dependencies: ["dependencies", "dependency", "critical path"],
    acceptanceCriteria: ["acceptance criteria", "acceptance"],
    slos: ["slo", "service level", "availability"],
    launchGate: ["launch gate", "go-live", "pilot approval"],
    businessOwner: ["business owner", "accountable owner", "owner"],
    deliveryOwner: ["delivery owner", "support owner"],
  };
  return valueAfterLabel(passage, labels[field] ?? [field]);
}

function toJson(value: unknown) {
  return JSON.stringify(value);
}

async function traceAgent(spec: AgentSpec, caseId: string | undefined, inputReference: string, output: unknown, status: "succeeded" | "abstained" | "waiting_for_human" | "failed", startedAt: number, context: { tenantKey?: string; userId?: string } = {}) {
  const traceId = `trace-${nanoid(10)}`;
  await createAgentTrace({ traceId, caseId, tenantKey: context.tenantKey ?? "demo", userId: context.userId ?? null, agentName: spec.name, inputReference, outputReference: toJson({ mode: getLLMStatus().mode, output }), status, durationMs: Date.now() - startedAt, totalWorkflowLatencyMs: Date.now() - startedAt, toolAllowlist: toJson(spec.tools), retryCount: 0, estimatedCostMicros: getLLMStatus().mode === "LIVE_LLM" ? null : 0, modelProvider: getLLMStatus().provider, modelName: getLLMStatus().model, safetyFlags: toJson(["retrieved_text_untrusted", status === "waiting_for_human" ? "human_review_required" : ""]), humanReviewRequired: status === "waiting_for_human" || status === "abstained" ? 1 : 0 });
  await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId, tenantKey: context.tenantKey ?? "demo", userId: context.userId ?? null, actor: spec.name, actorType: "agent", eventType: `AGENT_${status.toUpperCase()}`, oldValue: null, newValue: toJson({ agent: spec.name, output }), approvalState: status === "waiting_for_human" || status === "abstained" ? "human_required" : "not_required", idempotencyKey: `agent-${spec.name.toLowerCase().replaceAll(" ", "-")}-${traceId}`, metadata: toJson({ traceId, timeoutMs: spec.timeoutMs, retryPolicy: spec.retryPolicy }) });
  return traceId;
}

export async function runOutcomeWorkflow(input: { documentId: string; actor: string; caseName?: string; tenantKey?: string; userId?: string }) {
  const documents = await getFlowDocuments(input.tenantKey ?? "demo");
  const document = documents.find((candidate) => candidate.id === input.documentId);
  if (!document) throw new Error("Source document not found");
  if (document.processingStatus !== "indexed") throw new Error("Source document must be indexed before agents can run");

  const rawChunks = await getKnowledgeSources(document.id, input.tenantKey ?? "demo");
  const sourceDocument = document as SourceDocument;
  const chunks = rawChunks as KnowledgeChunk[];
  const evidenceQuery = "business outcome scope owners systems access dependencies acceptance criteria launch SLO policy";
  const hits = retrieveChunks(evidenceQuery, chunks, [sourceDocument], 12, undefined, input.tenantKey ?? "demo");
  const evidenceResult = buildEvidenceResult(evidenceQuery, hits);
  const primaryPassage = hits[0]?.chunk.content ?? "";
  const conflict = evidenceResult.status === "CONFLICTING";
  const fields = ["outcomeStatement", "scope", "exclusions", "systemsOfRecord", "dataOwners", "accessPrerequisites", "dependencies", "acceptanceCriteria", "slos", "launchGate", "businessOwner", "deliveryOwner"] as const;
  const citations = hits.slice(0, 8).map(citationFor);
  let extracted = Object.fromEntries(fields.map((field) => [field, fieldValue(field, primaryPassage)])) as Record<(typeof fields)[number], string>;
  let fieldStatuses = Object.fromEntries(fields.map((field) => [field, statusFor(extracted[field], conflict && ["slos", "accessPrerequisites"].includes(field))])) as Record<string, FieldStatus>;
  let intakeMode = getLLMStatus().mode;
  if (getLLMStatus().mode === "LIVE_LLM") {
    const live = await runLiveIntakeAgent({ filename: document.filename, citations });
    extracted = Object.fromEntries(fields.map((field) => [field, live.value[field].value])) as Record<(typeof fields)[number], string>;
    fieldStatuses = Object.fromEntries(fields.map((field) => [field, live.value[field].status])) as Record<string, FieldStatus>;
  }
  const caseId = `case-${nanoid(10)}`;
  const intake = { caseId, documentId: document.id, document: document.filename, fields: extracted, fieldStatuses, citations, status: "NEEDS_HUMAN_REVIEW" as const, missingFields: fields.filter((field) => fieldStatuses[field] === "MISSING"), agent: "Intake Agent", mode: intakeMode, llmProvider: getLLMStatus().provider, llmModel: getLLMStatus().model };
  const intakeTraceId = await traceAgent(agentSpecs[0]!, undefined, document.id, intake, intake.missingFields.length ? "abstained" : "succeeded", Date.now(), { tenantKey: input.tenantKey ?? "demo", userId: input.userId });

  const outcomeCase = await createOutcomeCase({
    id: caseId,
    name: input.caseName ?? document.filename.replace(/\.[^.]+$/, ""),
    outcomeStatement: extracted.outcomeStatement || missingValue,
    businessOwner: extracted.businessOwner || null,
    deliveryOwner: extracted.deliveryOwner || null,
    scope: extracted.scope || missingValue,
    exclusions: extracted.exclusions || missingValue,
    systemsOfRecord: extracted.systemsOfRecord || missingValue,
    dataOwners: extracted.dataOwners || missingValue,
    accessPrerequisites: extracted.accessPrerequisites || missingValue,
    dependencies: extracted.dependencies || missingValue,
    acceptanceCriteria: extracted.acceptanceCriteria || missingValue,
    riskLevel: conflict ? "high" : "medium",
    humanApprovers: input.actor,
    slos: extracted.slos || missingValue,
    launchGate: extracted.launchGate || "Human approval required before launch",
    runStateOwner: extracted.deliveryOwner || null,
    sourceCitations: toJson(citations),
    status: "readiness",
    readinessStatus: "needs_human_review",
    tenantKey: input.tenantKey ?? "demo",
  });
  await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", userId: input.userId ?? null, actor: input.actor, actorType: "human", eventType: "OUTCOME_CASE_CREATED", oldValue: null, newValue: toJson({ documentId: document.id, name: outcomeCase.name }), approvalState: "not_required", idempotencyKey: `workflow-case-${caseId}`, metadata: toJson({ intakeTraceId }) });

  const evidenceRows = fields.map((field, index) => {
    const hit = hits[index % Math.max(hits.length, 1)];
    const classification = fieldStatuses[field] === "SOURCE_BACKED" ? "source_backed" : fieldStatuses[field] === "CONFLICTING" ? "conflicting" : fieldStatuses[field] === "INFERRED" ? "inferred" : "missing";
    return { id: `evidence-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", documentId: hit?.document.id ?? document.id, fieldName: field, classification: classification as "source_backed" | "inferred" | "missing" | "conflicting", claim: extracted[field] || missingValue, passage: hit?.chunk.content ?? null, citation: hit ? `${hit.document.filename} · ${hit.chunk.section ?? `chunk ${hit.chunk.chunkIndex + 1}`}` : null, relevanceScore: hit ? Math.round(hit.score * 100) : 0, confidence: fieldStatuses[field] === "SOURCE_BACKED" ? 78 : 0, documentVersion: hit?.document.version ?? document.version };
  });
  await createEvidence(evidenceRows);
  const evidenceTraceId = await traceAgent(agentSpecs[1]!, caseId, evidenceQuery, evidenceResult, evidenceResult.abstained ? "abstained" : "succeeded", Date.now(), { tenantKey: input.tenantKey ?? "demo", userId: input.userId });

  const blockers = [
    { label: "Business owner", field: "businessOwner", reason: "An accountable owner is required before routing decisions.", severity: "high" as const, action: "Assign a business owner." },
    { label: "Access approval", field: "accessPrerequisites", reason: "Connector or API access is not source-backed.", severity: "critical" as const, action: "Confirm the access owner and approval boundary." },
    { label: "Acceptance criteria", field: "acceptanceCriteria", reason: "A measurable acceptance boundary is required for handoff.", severity: "high" as const, action: "Add testable acceptance criteria." },
    { label: "Launch SLO", field: "slos", reason: "No approved SLO was found in the indexed evidence.", severity: "high" as const, action: "Approve or define the launch SLO." },
  ].filter((blocker) => fieldStatuses[blocker.field] !== "SOURCE_BACKED");
  const readiness: { status: ReadinessStatus; blockers: Array<Record<string, unknown>> } = {
    status: conflict ? "NEEDS_HUMAN_REVIEW" : blockers.length ? "BLOCKED" : "READY",
    blockers: blockers.map((blocker) => ({ ...blocker, affectedOutcome: outcomeCase.outcomeStatement, owner: extracted.businessOwner || null, dependency: blocker.field === "accessPrerequisites" ? "Access Approval" : null, evidence: citations.filter((citation) => citation.sourceDocument === document.filename), recommendedNextAction: blocker.action })),
  };
  const readinessTraceId = await traceAgent(agentSpecs[2]!, caseId, caseId, readiness, readiness.status === "READY" ? "succeeded" : "waiting_for_human", Date.now(), { tenantKey: input.tenantKey ?? "demo", userId: input.userId });
  for (const blocker of readiness.blockers) {
    await createWorkItem({ id: `work-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", title: String(blocker.blocker), owner: typeof blocker.owner === "string" ? blocker.owner : null, status: "blocked", source: "Readiness Agent", idempotencyKey: `blocker-${caseId}-${String(blocker.field)}` });
  }

  const dependencyNodes = [
    { label: "Access Approval", owner: extracted.businessOwner || null, state: fieldStatuses.accessPrerequisites === "SOURCE_BACKED" ? "complete" : "blocked", dependsOn: null, isCriticalPath: 1, impact: "Connector testing cannot begin until access is approved.", recommendedAction: "Assign an access owner and record approval." },
    { label: "Connector Test", owner: extracted.deliveryOwner || null, state: fieldStatuses.accessPrerequisites === "SOURCE_BACKED" ? "waiting" : "waiting", dependsOn: "Access Approval", isCriticalPath: 1, impact: "Integration confidence remains unverified.", recommendedAction: "Run the connector contract test after access approval." },
    { label: "Security Review", owner: null, state: "waiting", dependsOn: "Connector Test", isCriticalPath: 1, impact: "Data handling and model restrictions need review.", recommendedAction: "Route the indexed policy and architecture citations to security." },
    { label: "Pilot Approval", owner: input.actor, state: "waiting", dependsOn: "Security Review", isCriticalPath: 1, impact: "The customer-facing pilot cannot be committed without a human gate.", recommendedAction: "Approve the launch packet after blockers are resolved." },
  ];
  const dependencyRows = dependencyNodes.map((node, index) => ({ id: `dependency-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", label: node.label, owner: node.owner, state: node.state as "complete" | "blocked" | "waiting" | "failed", dependsOn: index === 0 ? null : dependencyNodes[index - 1]!.label, isCriticalPath: node.isCriticalPath, impact: node.impact, recommendedAction: node.recommendedAction }));
  await createDependencies(dependencyRows);
  const dependencyTraceId = await traceAgent(agentSpecs[3]!, caseId, caseId, { nodes: dependencyNodes, criticalPath: dependencyNodes.map((node) => node.label) }, "succeeded", Date.now(), { tenantKey: input.tenantKey ?? "demo", userId: input.userId });

  const policy = conflict ? { status: "POLICY_CONFLICT" as const, policyA: "Retention policy A: 30 days", policyB: "Retention policy B: 90 days", conflictingSections: citations.slice(0, 2), affectedAction: "External partner data retention", requiredHumanDecision: "Select the authoritative retention policy before routing." } : { status: "CLEAR" as const, policyA: null, policyB: null, conflictingSections: [], affectedAction: null, requiredHumanDecision: null };
  const policyTraceId = await traceAgent(agentSpecs[4]!, caseId, "policy validation", policy, policy.status === "CLEAR" ? "succeeded" : "waiting_for_human", Date.now(), { tenantKey: input.tenantKey ?? "demo", userId: input.userId });
  if (policy.status !== "CLEAR") {
    await createRisk({ id: `risk-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", title: "Conflicting policy sources", severity: "high", status: "open", mitigation: "Pause autonomous routing and obtain an explicit human decision on the authoritative policy.", evidenceIds: toJson(citations.slice(0, 2).map((citation) => citation.chunkId)) });
  }
  if (policy.status !== "CLEAR" || readiness.status !== "READY") {
    await createApproval({ id: `approval-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", decisionRequired: policy.status !== "CLEAR" ? "Resolve policy conflict before routing" : "Resolve readiness blockers before launch", evidenceIds: toJson(evidenceRows.map((row) => row.id)), recommendation: policy.requiredHumanDecision ?? "Review the readiness blocker packet", confidence: evidenceResult.confidence, risk: conflict ? "high" : "medium", affectedSystems: extracted.systemsOfRecord || missingValue, consequences: "FlowOS will not route a customer-facing commitment until this human gate is resolved.", requester: input.actor, owner: extracted.businessOwner || input.actor, decision: "pending" });
    await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", userId: input.userId ?? null, actor: "Policy Agent", actorType: "agent", eventType: "POLICY_CONFLICT", oldValue: null, newValue: toJson(policy), approvalState: "human_required", idempotencyKey: `policy-${caseId}`, metadata: toJson({ policyTraceId }) });
  }

  const handoff = { status: readiness.status === "READY" && policy.status === "CLEAR" ? "PREPARED" : "WAITING_FOR_APPROVAL", packet: { outcome: outcomeCase.outcomeStatement, scope: outcomeCase.scope, exclusions: outcomeCase.exclusions, stakeholders: { businessOwner: outcomeCase.businessOwner, deliveryOwner: outcomeCase.deliveryOwner }, systems: outcomeCase.systemsOfRecord, dependencies: dependencyNodes, blockers: readiness.blockers, evidence: evidenceRows, acceptanceCriteria: outcomeCase.acceptanceCriteria, risks: policy.status === "CLEAR" ? [] : ["Conflicting policy requires human resolution"], slos: outcomeCase.slos, securityRequirements: "Review access classification and policy citations before launch.", approvals: await listApprovals(caseId, input.tenantKey ?? "demo"), launchGate: outcomeCase.launchGate, supportOwner: outcomeCase.runStateOwner, nextActions: readiness.blockers.map((blocker) => blocker.recommendedNextAction) } };
  const handoffTraceId = await traceAgent(agentSpecs[5]!, caseId, caseId, handoff, handoff.status === "PREPARED" ? "succeeded" : "waiting_for_human", Date.now(), { tenantKey: input.tenantKey ?? "demo", userId: input.userId });

  const runState = { evidenceCoverage: evidenceRows.filter((row) => row.classification === "source_backed").length / evidenceRows.length * 100, ownerCompleteness: extracted.businessOwner && extracted.deliveryOwner ? 100 : 50, sLOStatus: outcomeCase.slos === missingValue ? "NOT_LIVE" : "SHADOW_MODE", observations: [{ metricName: "evidence_coverage", value: String(Math.round(evidenceRows.filter((row) => row.classification === "source_backed").length / evidenceRows.length * 100)), target: "80", status: "healthy" as const }, { metricName: "owner_completeness", value: extracted.businessOwner && extracted.deliveryOwner ? "100" : "50", target: "100", status: extracted.businessOwner && extracted.deliveryOwner ? "healthy" as const : "warning" as const }, { metricName: "slo_status", value: outcomeCase.slos === missingValue ? "not_live" : "shadow_mode", target: "healthy", status: outcomeCase.slos === missingValue ? "warning" as const : "healthy" as const }], events: readiness.blockers.map((blocker) => `Run-State Agent: ${blocker.blocker} remains unresolved.`) };
  for (const observation of runState.observations) await createMetricObservation({ id: `metric-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", ...observation });
  const runStateTraceId = await traceAgent(agentSpecs[6]!, caseId, caseId, runState, "succeeded", Date.now(), { tenantKey: input.tenantKey ?? "demo", userId: input.userId });
  await updateOutcomeCase(caseId, { readinessStatus: readiness.status === "READY" ? "ready" : readiness.status === "BLOCKED" ? "blocked" : "needs_human_review", status: policy.status !== "CLEAR" || readiness.status !== "READY" ? "approval" : "handoff" });
  await createAuditEvent({ id: `audit-${nanoid(10)}`, caseId, tenantKey: input.tenantKey ?? "demo", userId: input.userId ?? null, actor: "Handoff Agent", actorType: "agent", eventType: "WORKFLOW_COMPLETED", oldValue: "intake", newValue: handoff.status, approvalState: handoff.status === "PREPARED" ? "not_required" : "human_required", idempotencyKey: `workflow-complete-${caseId}`, metadata: toJson({ traces: { intakeTraceId, evidenceTraceId, readinessTraceId, dependencyTraceId, policyTraceId, handoffTraceId, runStateTraceId } }) });
  return { caseId, outcomeCase: await getOutcomeCase(caseId, input.tenantKey ?? "demo") ?? outcomeCase, intake, evidence: evidenceRows, evidenceResult, readiness, dependencies: dependencyRows, policy, handoff, runState, traces: { intakeTraceId, evidenceTraceId, readinessTraceId, dependencyTraceId, policyTraceId, handoffTraceId, runStateTraceId } };
}

export async function getWorkflowDetail(caseId: string, tenantKey = "demo") {
  const [outcomeCase, evidence, dependencies, approvals, risks, metrics, workItems] = await Promise.all([getOutcomeCase(caseId, tenantKey), getCaseEvidence(caseId, tenantKey), listDependencies(caseId, tenantKey), listApprovals(caseId, tenantKey), listRisks(caseId, tenantKey), listMetricObservations(caseId, tenantKey), listWorkItems(caseId, tenantKey)]);
  if (!outcomeCase) return null;
  return { outcomeCase, evidence, dependencies, approvals, risks, metrics, workItems };
}
