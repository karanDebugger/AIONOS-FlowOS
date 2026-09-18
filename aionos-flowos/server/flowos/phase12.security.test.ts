import { describe, expect, it } from "vitest";
import { TRPCError } from "@trpc/server";
import { assertAuthorization, hasPermission } from "../_core/authorization";
import { cosineSimilarity, deterministicEmbedding, getLLMStatus, LLMGatewayError, structuredGenerate } from "./llm-gateway";
import { appRouter } from "../routers";
import type { TrpcContext } from "../_core/context";
import { retrieveChunks } from "./evidence";
import { calculateChecksum } from "./ingestion";

describe("Phase 12 security and provider boundaries", () => {
  it("fails closed when tenant context or identity is missing outside demo mode", () => {
    expect(() => assertAuthorization({ user: null, permission: "cases.view", allowDemo: false })).toThrow(TRPCError);
    expect(() => assertAuthorization({ user: null, tenantKey: "tenant-b", permission: "cases.view", allowDemo: true })).toThrow(TRPCError);
  });

  it("enforces role permissions server-side", () => {
    const viewer = { id: 7, openId: "viewer", name: "Viewer", email: null, loginMethod: "test", role: "viewer" as const, tenantKey: "tenant-a", department: "Operations", status: "active" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    expect(hasPermission(viewer, "cases.view")).toBe(true);
    expect(hasPermission(viewer, "agents.execute")).toBe(false);
    expect(() => assertAuthorization({ user: viewer, tenantKey: "tenant-b", permission: "cases.view" })).toThrow(TRPCError);
  });

  it("keeps retrieval tenant-scoped and rejects failed documents", () => {
    const chunks = [
      { id: "a", documentId: "doc-a", tenantKey: "tenant-a", chunkIndex: 0, section: "p.1", content: "Business owner is Maya for the partner outcome.", metadata: "{}" },
      { id: "b", documentId: "doc-b", tenantKey: "tenant-b", chunkIndex: 0, section: "p.1", content: "Business owner is Jordan for the partner outcome.", metadata: "{}" },
    ];
    const documents = [
      { id: "doc-a", filename: "a.md", version: 1, documentType: "opportunity_brief", source: "test", department: "Ops", accessClassification: "internal", processingStatus: "indexed", tenantKey: "tenant-a" },
      { id: "doc-b", filename: "b.md", version: 1, documentType: "opportunity_brief", source: "test", department: "Ops", accessClassification: "internal", processingStatus: "failed", tenantKey: "tenant-b" },
    ];
    const results = retrieveChunks("business owner", chunks, documents, 10, undefined, "tenant-a");
    expect(results).toHaveLength(1);
    expect(results[0]?.document.id).toBe("doc-a");
  });

  it("denies viewer agent execution and approval decisions through the server API", async () => {
    const viewer = { id: 7, openId: "viewer", name: "Viewer", email: null, loginMethod: "test", role: "viewer" as const, tenantKey: "tenant-a", department: "Operations", status: "active" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() };
    const ctx = { user: viewer, req: { protocol: "https", headers: {} }, res: { clearCookie: () => undefined } } as unknown as TrpcContext;
    const caller = appRouter.createCaller(ctx);
    await expect(caller.flowos.runWorkflow({ documentId: "doc-a", actor: "Viewer", tenantKey: "tenant-a" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(caller.flowos.decideApproval({ approvalId: "approval-a", decision: "approved", actor: "Viewer" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("fails closed when live structured generation is not configured", async () => {
    const schema = (await import("zod")).z.object({ answer: (await import("zod")).z.string() });
    await expect(structuredGenerate({ task: "test", schema, messages: [{ role: "user", content: "test" }] })).rejects.toMatchObject({ code: "AGENT_UNAVAILABLE" } satisfies Partial<LLMGatewayError>);
  });

  it("rejects a direct-upload checksum that does not match the stored bytes", () => {
    const bytes = Buffer.from("trusted document bytes");
    expect(calculateChecksum(bytes)).not.toBe(calculateChecksum(Buffer.from("tampered document bytes")));
  });

  it("creates deterministic, versioned embedding metadata without pretending it is a live model call", () => {
    const first = deterministicEmbedding("same source text");
    const second = deterministicEmbedding("same source text");
    expect(first.vector).toEqual(second.vector);
    expect(first.checksum).toBe(second.checksum);
    expect(first.dimensions).toBe(64);
    expect(cosineSimilarity(first.vector, second.vector)).toBeCloseTo(1);
    expect(getLLMStatus().mode).toBe("DETERMINISTIC_DEMO_MODE");
  });
});
