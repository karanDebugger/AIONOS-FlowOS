import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

function createContext(): TrpcContext {
  return {
    user: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("flowos Phase 1 persistence contracts", () => {
  it("registers a document with explicit classification metadata", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.flowos.registerDocument({
      filename: "synthetic-opportunity.pdf",
      documentType: "opportunity_brief",
      uploadedBy: "demo-user",
      source: "synthetic-demo",
      department: "Operations",
      accessClassification: "internal",
      checksum: "sha256-demo-001",
    });

    expect(result.success).toBe(true);
    expect(result.document.filename).toBe("synthetic-opportunity.pdf");
    expect(result.document.processingStatus).toBe("uploaded");
  });

  it("creates a typed OutcomeCase at the intake gate", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.flowos.createCase({
      name: "Synthetic support automation",
      outcomeStatement: "Reduce triage time from 30 minutes to 5 minutes",
      scope: "Classify and route support tickets",
      exclusions: "No autonomous customer response",
      systemsOfRecord: "Jira and SharePoint",
      dataOwners: "Support operations",
      accessPrerequisites: "Jira service account approval",
      dependencies: "Access approval -> connector test",
      acceptanceCriteria: "95% routing accuracy on golden set",
      humanApprovers: "Support operations lead",
      slos: "p95 under 90 seconds",
      launchGate: "Human approval after security review",
      sourceCitations: "synthetic-opportunity.pdf#outcome",
    });

    expect(result.success).toBe(true);
    expect(result.case.status).toBe("intake");
    expect(result.case.readinessStatus).toBe("needs_human_review");
  });
});
