# AIONOS FlowOS Architecture

## Current implementation boundary

FlowOS is a governed Agentic AI control plane for carrying outcome context from an opportunity through readiness, approval, handoff, and run-state monitoring. The current build preserves the original dark operator-console dashboard and adds the first persistent domain layer behind it.

## Phase 1 domain model

The MySQL/TiDB schema now includes `flowos_outcome_cases`, `flowos_documents`, `flowos_evidence`, `flowos_dependencies`, `flowos_approvals`, `flowos_work_items`, `flowos_knowledge_sources`, `flowos_agent_traces`, `flowos_metric_observations`, `flowos_risks`, `flowos_evaluation_cases`, and `flowos_audit_events`. JSON/text fields are used for flexible agent payloads and provenance while the workflow stabilizes; normalized relations can be added after the pilot data contract is validated.

## Governed execution model

The intended workflow is a bounded state machine: Intake → Evidence → Readiness → Dependencies → Policy → Human Approval → Handoff → Run State. Each transition must retain a trace and audit event. Missing evidence causes abstention; conflicting evidence pauses autonomous routing; sensitive actions remain human-controlled.

## Current typed API surface

The tRPC router exposes dashboard reads, persisted case reads, case creation, document registration, approval recording, and a deterministic safe-retry simulation. The existing synthetic dashboard remains available as a backward-compatible demo read path while persistent records are introduced incrementally.

## Data and safety boundary

The current demo is explicitly synthetic and contains no production credentials or confidential customer data. Storage keys, document checksums, tenant keys, approval state, idempotency keys, agent allowlists, retries, and trace references are modeled so the next phase can add real upload and indexing without hiding provenance.

## Historical implementation plan

The original Phase 2/Phase 3 plan below is retained as a record of the implementation sequence. Those capabilities are now complete; the current production boundary and remaining hardening work are documented in the later sections.


## Phase 2: Document ingestion and knowledge preparation

Phase 2 adds a bounded ingestion path without introducing retrieval or model-generated claims. The `flowos.uploadDocument` procedure accepts a base64 document payload from the web client, validates the format and 15 MB size limit, computes a SHA-256 checksum, stores the original bytes through the configured object-storage helper, and tracks `uploaded`, `processing`, `indexed`, or `failed` status on the document record.

Supported source formats are PDF, plain text, Markdown, CSV, and JSON. PDF text is extracted with `pdf-parse`; other supported formats are decoded as UTF-8. Normalized text is split into page-aware chunks of approximately 1,400 characters with a small overlap. Each `knowledgeSources` row records the document version, checksum, page number, character range, content type, filename, and `direct_document_text` provenance. The UI exposes the upload form, processing status, checksum, and indexed chunk preview under Documents / Knowledge. Phase 3 can build retrieval and citation behavior on these chunks without changing the upload contract.


## Phase 3: Retrieval and Evidence Agent

Phase 3 adds a deterministic lexical/hybrid retrieval layer over indexed `flowos_knowledge_sources` rows. Retrieval filters to indexed documents, optionally applies access classification, ranks token coverage with phrase and density boosts, and returns bounded results with source filename, document version, page/section, chunk ID, passage, relevance score, and retrieval timestamp.

The Evidence Agent is deliberately grounded: it returns `SOURCE_BACKED` only when a sufficiently relevant passage exists, `MISSING` when evidence is absent or weak, and `CONFLICTING` when relevant passages contain contradictory language or materially different numeric claims. Missing and conflicting states abstain from answering and record a human-review or do-not-invent guardrail. Retrieved passages containing prompt-injection patterns are retained as untrusted evidence with a safety flag and are never treated as instructions. Each Evidence Agent call writes an agent trace and audit event.


Retrieved passages that match prompt-injection patterns are treated as untrusted data. They remain visible as citations for operator inspection, but the Evidence Agent returns an abstention with `prompt_injection_isolated` and never promotes that passage to an answer or instruction.


## Master-spec workflow implementation

The current build now exposes a bounded state-machine workflow over the existing domain model: **Intake → Evidence → Readiness → Dependencies → Policy → Human Approval → Handoff → Run State**. The `runWorkflow` procedure requires an indexed source document, creates a persistent `OutcomeCase`, writes field-level evidence rows and citations, generates directed dependency nodes, creates readiness work items, records policy risks and approval gates, persists shadow-mode metric observations, and writes an `AgentTrace` plus `AuditEvent` for every stage.

Each agent has an explicit responsibility, tool allowlist, timeout, retry policy, confidence threshold, and terminal state. The agents do not form an uncontrolled loop. They run once in a fixed order, use bounded deterministic retrieval and classification, and route missing or conflicting information to human review. Handoff output is a prepared packet only. It cannot approve itself, grant privileged access, deploy code, change employment data, or make external commitments.

The operational UI now includes Case Detail, Approval Inbox, Agent Activity, Policy & Guardrails, Run-State / Telemetry, Evaluation Dashboard, and the existing Documents / Knowledge view. Case Detail visualizes the outcome-to-run-state path, evidence classification, dependency graph, traces, telemetry, and handoff packet status. Approval decisions write audit events and preserve the pending/approved/rejected/changes-requested/escalated state.

The Evaluation Dashboard runs and persists a deterministic golden suite covering stale documents, contradictory policies, missing owners, prompt injection, unavailable APIs, duplicate events, partial failures, and unsupported claims. The suite reports pass rate, citation correctness, unsafe-action refusal, latency, estimated cost, evidence coverage, readiness precision, dependency-path accuracy, approval-routing accuracy, and human correction rate. Current synthetic evaluation results are deterministic and do not represent production performance.

The demo remains intentionally synthetic. Existing dashboard seed data is still backward-compatible and not automatically converted into persistent workflow state. To execute the full workflow, upload a supported source in Documents / Knowledge, wait for `indexed`, select it, and choose **Run governed workflow**. Embedding-backed semantic retrieval, production tenant enforcement, multipart upload, duplicate checksum supersession, and real connector integrations remain hardening steps for a production deployment.

## Phase 12: production hardening and final master-prompt alignment

Phase 12 hardens the previously implemented phases without replacing their deterministic demo behavior. The server now resolves identity, role, permission, and tenant context through `server/_core/authorization.ts`. Protected FlowOS procedures fail closed when authentication or tenant context is absent, while the explicitly labeled synthetic demo mode remains available only for the `demo` tenant. Viewer, reviewer, operator, and administrator permissions are enforced on the server; UI visibility is not treated as an authorization boundary.

The document model now stores tenant keys, version supersession, checksum identity, and embedding metadata. Indexed chunks carry deterministic, reproducible vector metadata and retrieval combines lexical coverage with cosine similarity when vectors are present. Tenant-scoped reads are applied to cases, evidence, documents, approvals, dependencies, traces, telemetry, risks, work items, audit events, and evaluation cases. A reviewed migration adds the evidence tenant field without destructive operations.

The LLM gateway is provider-independent and server-only. It supports optional structured generation through the existing built-in Forge-compatible helper, Zod validation, bounded token requests, latency and usage metadata, and explicit `AGENT_UNAVAILABLE` / malformed-output failure states. The live provider is enabled only with an explicit `FLOWOS_LIVE_LLM=true` configuration; otherwise the UI and traces identify deterministic demo mode. The Intake and Evidence Agents can use validated structured live outputs when configured, but never silently fabricate a result when the provider is unavailable. Private chain-of-thought is not stored; only a concise reasoning summary, citations, model metadata, safety flags, and human-review state are persisted.

The upload boundary now includes server-generated direct object-storage presigned uploads and a tenant-scoped completion procedure with size and object-length validation. The existing base64 route remains for local demo compatibility. Ingestion avoids duplicate checksums, increments filename versions, links superseded documents, parses content server-side, creates reproducible embeddings, and retains direct provenance.

The final control boundary remains intentionally conservative: FlowOS can prepare handoff packets, route approvals, simulate connector failures, and record telemetry, but it does not self-approve, publish externally, change production systems, or bypass a human gate. Live connectors, production vector search, antivirus scanning, provider secrets, backups, and deployment migration automation remain deployment-specific follow-up work rather than hidden demo behavior.
