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

describe("flowos dashboard", () => {
  it("returns an evidence-backed control tower snapshot", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.flowos.dashboard();

    expect(result.kpis.activeHandoffs).toBe(14);
    expect(result.cases).toHaveLength(4);
    expect(result.evidence.some((item) => item.status === "missing")).toBe(true);
    expect(result.dependencies.find((item) => item.state === "blocked")?.owner).toBe("Unassigned");
  });

  it("records an approval without changing scope", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.flowos.approve({ approvalId: "ap-01" });

    expect(result).toEqual({
      success: true,
      approvalId: "ap-01",
      message: "Approval recorded. Scope remains unchanged until the next human gate.",
    });
  });

  it("simulates a safe retry while keeping the blocker visible", async () => {
    const caller = appRouter.createCaller(createContext());
    const result = await caller.flowos.simulateRun();

    expect(result.success).toBe(true);
    expect(result.event).toContain("blocker remains visible");
    expect(Number.isNaN(Date.parse(result.timestamp))).toBe(false);
  });
});
