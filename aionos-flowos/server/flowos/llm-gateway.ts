import { createHash } from "node:crypto";
import { z } from "zod";
import { invokeLLM } from "../_core/llm";
import { ENV } from "../_core/env";

export type LLMMode = "LIVE_LLM" | "DETERMINISTIC_DEMO_MODE";
export type LLMFailureCode = "AGENT_UNAVAILABLE" | "MALFORMED_LLM_OUTPUT" | "LLM_TIMEOUT";

export type LLMUsage = {
  provider: string;
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  latencyMs: number;
  estimatedCostMicros: number | null;
};

export type LLMResult<T> = { value: T; usage: LLMUsage; mode: LLMMode; reasoningSummary: string };

export class LLMGatewayError extends Error {
  constructor(public readonly code: LLMFailureCode, message: string, public readonly usage?: LLMUsage) {
    super(message);
    this.name = "LLMGatewayError";
  }
}

export function getLLMStatus() {
  const liveConfigured = Boolean(ENV.forgeApiKey && process.env.FLOWOS_LIVE_LLM === "true");
  return {
    mode: liveConfigured ? "LIVE_LLM" as const : "DETERMINISTIC_DEMO_MODE" as const,
    provider: liveConfigured ? ENV.llmProvider : "deterministic-demo",
    model: liveConfigured ? ENV.llmModel || "gateway-default" : ENV.embeddingModel,
    message: liveConfigured ? "Live LLM provider configured." : "LLM provider unavailable — deterministic demo mode active.",
  };
}

function estimateCost(inputTokens: number | null, outputTokens: number | null) {
  if (inputTokens === null && outputTokens === null) return null;
  return Math.round(((inputTokens ?? 0) * 0.000002 + (outputTokens ?? 0) * 0.000006) * 1_000_000);
}

function jsonFromResponse(content: string) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced?.[1] ?? trimmed) as unknown;
}

export async function structuredGenerate<T>({
  task,
  schema,
  messages,
  maxTokens = 1200,
}: {
  task: string;
  schema: z.ZodType<T>;
  messages: Array<{ role: "system" | "user"; content: string }>;
  maxTokens?: number;
}): Promise<LLMResult<T>> {
  const status = getLLMStatus();
  const startedAt = Date.now();
  if (status.mode !== "LIVE_LLM") {
    throw new LLMGatewayError("AGENT_UNAVAILABLE", status.message, {
      provider: status.provider,
      model: status.model,
      inputTokens: null,
      outputTokens: null,
      latencyMs: Date.now() - startedAt,
      estimatedCostMicros: null,
    });
  }
  try {
    const response = await invokeLLM({
      model: ENV.llmModel || undefined,
      messages,
      maxTokens,
      outputSchema: { name: task, schema: { type: "object", additionalProperties: true }, strict: false },
      responseFormat: { type: "json_object" },
    });
    const content = response.choices[0]?.message.content;
    if (typeof content !== "string") throw new LLMGatewayError("MALFORMED_LLM_OUTPUT", "LLM returned no structured content.");
    const parsed = schema.safeParse(jsonFromResponse(content));
    if (!parsed.success) throw new LLMGatewayError("MALFORMED_LLM_OUTPUT", `LLM output failed schema validation: ${parsed.error.issues.map((issue) => issue.path.join(".")).join(", ")}`);
    const usage = { provider: status.provider, model: response.model || status.model, inputTokens: response.usage?.prompt_tokens ?? null, outputTokens: response.usage?.completion_tokens ?? null, latencyMs: Date.now() - startedAt, estimatedCostMicros: estimateCost(response.usage?.prompt_tokens ?? null, response.usage?.completion_tokens ?? null) };
    return { value: parsed.data, usage, mode: "LIVE_LLM", reasoningSummary: "Structured output validated against the task schema; private chain-of-thought was not stored." };
  } catch (error) {
    if (error instanceof LLMGatewayError) throw error;
    throw new LLMGatewayError("AGENT_UNAVAILABLE", error instanceof Error ? error.message : "LLM provider unavailable.", { provider: status.provider, model: status.model, inputTokens: null, outputTokens: null, latencyMs: Date.now() - startedAt, estimatedCostMicros: null });
  }
}

export function deterministicEmbedding(text: string, model = ENV.embeddingModel) {
  const seed = createHash("sha256").update(`${model}\n${text}`).digest();
  const vector = Array.from({ length: 64 }, (_, index) => {
    const byte = seed[index % seed.length] ?? 0;
    return Number(((byte / 127.5) - 1).toFixed(6));
  });
  return { vector, model, dimensions: vector.length, checksum: createHash("sha256").update(JSON.stringify(vector)).digest("hex") };
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] ?? 0;
    const b = right[index] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  return leftNorm && rightNorm ? dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm)) : 0;
}
