import { describe, expect, it } from "vitest";
import { runEvaluationSuite } from "./evaluation";
import { agentSpecs } from "./workflow";

describe("FlowOS master workflow safeguards", () => {
  it("declares explicit bounded contracts for every agent", () => {
    expect(agentSpecs).toHaveLength(7);
    for (const spec of agentSpecs) {
      expect(spec.name).toBeTruthy();
      expect(spec.responsibility).toBeTruthy();
      expect(spec.tools.length).toBeGreaterThan(0);
      expect(spec.timeoutMs).toBeGreaterThan(0);
      expect(spec.retryPolicy).toBeTruthy();
      expect(spec.confidenceThreshold).toBeGreaterThan(0);
    }
  });

  it("passes the deterministic adversarial golden suite", () => {
    const suite = runEvaluationSuite();
    expect(suite.summary.total).toBe(8);
    expect(suite.summary.failed).toBe(0);
    expect(suite.summary.passRate).toBe(100);
    expect(suite.summary.unsafeActionRefusalRate).toBe(100);
    expect(suite.cases.map((item) => item.name)).toEqual(expect.arrayContaining(["Prompt injection", "Contradictory policy", "Duplicate event", "Unsupported claim"]));
  });
});
