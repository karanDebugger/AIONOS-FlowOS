# AIONOS FlowOS implementation tracker

## Completed in this build

- [x] Phase 1: persistent domain model, audit events, typed tRPC procedures, and synthetic control tower.
- [x] Phase 2: document upload through object storage, SHA-256 checksums, PDF/text parsing, deterministic page-aware chunking, indexed status transitions, provenance metadata, and Documents / Knowledge UI.
- [x] Phase 3: bounded retrieval, Evidence Agent classifications, citations, confidence, abstention, audit events, and prompt-injection isolation.
- [x] Phase 4: Intake Agent with typed OutcomeCase extraction, field-level provenance classifications, missing-field handling, and persistent case creation.
- [x] Phase 5: Readiness Agent with explicit READY, BLOCKED, and NEEDS_HUMAN_REVIEW states, blockers, work items, owners, severity, evidence, and recommended actions.
- [x] Phase 6: Dependency Agent with directed nodes, upstream/downstream relationships, critical-path markers, impact, and recommended next actions.
- [x] Phase 7: Policy Agent with policy-conflict detection, explicit POLICY_CONFLICT state, risk persistence, and approval routing.
- [x] Phase 8: Handoff Agent with prepared delivery packet output and strict no-self-approval/no-external-action boundary.
- [x] Phase 9: Run-State Agent with shadow-mode metric observations, SLO/owner/evidence events, and safe connector-failure simulation.
- [x] Phase 10: persistent Approval Inbox, decision actions, human-gate audit events, Agent Activity trace viewer, and Policy & Guardrails view.
- [x] Phase 11: Evaluation Dashboard with a deterministic golden/adversarial suite and persisted evaluation-run procedure.
- [x] Phase 12: server-side RBAC and permissions, fail-closed authentication and tenant context, tenant-scoped persistence reads, deterministic embedding metadata and hybrid reranking, checksum deduplication, version supersession, direct presigned uploads, structured live-LLM gateway, explicit demo-mode labeling, and observability metadata.
- [x] Final verification: 22 Vitest tests passing across 7 files, TypeScript check passing, production build passing, migration applied, direct-upload checksum regression covered, and browser verification of Control Tower and Documents / Knowledge.

## Remaining deployment-specific hardening backlog

| Area | Current boundary | Next hardening step |
|---|---|---|
| Retrieval | Deterministic embedding metadata plus bounded lexical/hybrid reranking | Move vectors into the selected production vector store and add provider governance/evaluation |
| Connectors | Safe retry is deterministic simulation | Add provider adapters with idempotency keys, timeouts, structured errors, contract tests, and server-side credentials |
| Upload security | Direct presigned upload plus bounded base64 demo fallback | Add antivirus/content validation and production retention policy |
| Observability | Tenant/user/model/latency/cost/safety fields persisted | Add redaction, retention, dashboards, and alerting policy |
| Deployment | Full-stack dev server, build, and reviewed migrations verified | Add authenticated staging, automated migration promotion, backups, rollback, and runbooks |
| Evaluation | Deterministic golden/adversarial suite | Add production-like datasets, release gates, and drift monitoring |

## Operator flow

1. Upload an anonymized Opportunity Brief, SOW, Discovery Notes, Architecture Document, or Internal Use-Case Request.
2. Select the indexed source and choose **Run governed workflow**.
3. Inspect the generated Case Detail path, evidence classifications, readiness blockers, dependencies, policy risks, and trace chain.
4. Review and decide pending items in Approval Inbox.
5. Prepare the handoff packet only after the human gates are resolved.
6. Use Run-State / Telemetry and safe connector simulation to observe post-handoff behavior.
7. Run the Evaluation Dashboard suite after workflow or guardrail changes.
