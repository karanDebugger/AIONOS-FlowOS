import { deterministicEmbedding, cosineSimilarity } from "./llm-gateway";
export type KnowledgeChunk = {
  id: string;
  documentId: string;
  tenantKey?: string;
  documentVersion?: number;
  chunkIndex: number;
  section: string | null;
  content: string;
  metadata: string;
  createdAt?: Date;
};

export type SourceDocument = {
  id: string;
  filename: string;
  version: number;
  documentType: string;
  source: string;
  department: string;
  accessClassification: string;
  processingStatus: string;
  tenantKey?: string;
};

export type RetrievalHit = {
  chunk: KnowledgeChunk;
  document: SourceDocument;
  score: number;
  metadata: Record<string, unknown>;
  safetyFlags: string[];
  retrievalMethod: "hybrid" | "lexical";
};

export type EvidenceStatus = "SOURCE_BACKED" | "MISSING" | "CONFLICTING";

export type EvidenceCitation = {
  sourceDocument: string;
  documentId: string;
  documentVersion: number;
  page: number | null;
  section: string | null;
  chunkId: string;
  passage: string;
  relevanceScore: number;
  retrievedAt: string;
  safetyFlags: string[];
  retrievalMethod?: "hybrid" | "lexical";
};

const stopWords = new Set(["a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "how", "in", "is", "it", "of", "on", "or", "that", "the", "this", "to", "was", "what", "when", "where", "which", "with"]);
const instructionPattern = /ignore\s+(all\s+)?previous|system\s+message|developer\s+instruction|assistant\s+instruction|reveal\s+(the\s+)?secret|disregard\s+the\s+policy/i;
const conflictPattern = /\b(conflict|contradict|contradictory|disagree|inconsistent|cannot be reconciled)\b/i;

function tokens(value: string) {
  return value.toLowerCase().match(/[a-z0-9][a-z0-9_-]{1,}/g)?.filter((token) => !stopWords.has(token)) ?? [];
}

function metadataFor(chunk: KnowledgeChunk) {
  try {
    const parsed = JSON.parse(chunk.metadata) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function safetyFlags(content: string) {
  return instructionPattern.test(content) ? ["untrusted_instruction_text"] : [];
}

export function scoreChunk(query: string, content: string) {
  const queryTokens = Array.from(new Set(tokens(query)));
  if (queryTokens.length === 0) return 0;
  const contentTokens = tokens(content);
  const contentSet = new Set(contentTokens);
  const matched = queryTokens.filter((token) => contentSet.has(token)).length;
  if (matched === 0) return 0;
  const coverage = matched / queryTokens.length;
  const phraseBoost = content.toLowerCase().includes(query.trim().toLowerCase()) ? 0.25 : 0;
  const density = Math.min(0.15, contentTokens.filter((token) => queryTokens.includes(token)).length / Math.max(contentTokens.length, 1));
  return Math.min(1, coverage * 0.7 + phraseBoost + density);
}

export function retrieveChunks(query: string, chunks: KnowledgeChunk[], documents: SourceDocument[], limit = 6, accessClassification?: string, tenantKey = "demo") {
  const documentsById = new Map(documents.map((document) => [document.id, document]));
  const hits: RetrievalHit[] = [];
  for (const chunk of chunks) {
    const document = documentsById.get(chunk.documentId);
    if (!document || document.processingStatus !== "indexed" || (document.tenantKey ?? "demo") !== tenantKey || (chunk.tenantKey && chunk.tenantKey !== tenantKey) || (accessClassification && document.accessClassification !== accessClassification)) continue;
    const lexicalScore = scoreChunk(query, chunk.content);
    if (lexicalScore <= 0) continue;
    let storedEmbedding: number[] = [];
    try {
      const value = (chunk as KnowledgeChunk & { embedding?: string }).embedding;
      if (typeof value === "string") storedEmbedding = JSON.parse(value) as number[];
    } catch {
      storedEmbedding = [];
    }
    const semanticScore = storedEmbedding.length ? Math.max(0, (cosineSimilarity(deterministicEmbedding(query).vector, storedEmbedding) + 1) / 2) : 0;
    const score = Math.min(1, lexicalScore * 0.7 + semanticScore * 0.3);
    const metadata = metadataFor(chunk);
    const retrievalMethod = storedEmbedding.length ? "hybrid" : "lexical";
    hits.push({ chunk, document, score, metadata: { ...metadata, documentVersion: chunk.documentVersion ?? document.version, retrievalMethod }, safetyFlags: safetyFlags(chunk.content), retrievalMethod });
  }
  return hits.sort((left, right) => right.score - left.score || left.chunk.chunkIndex - right.chunk.chunkIndex).slice(0, Math.max(1, Math.min(limit, 20)));
}
function numericValues(passage: string) {
  return Array.from(passage.matchAll(/\b\d+(?:\.\d+)?\b/g), (match) => match[0]);
}

export function classifyEvidence(query: string, hits: RetrievalHit[]) {
  if (hits.length === 0 || hits[0]!.score < 0.16) return { status: "MISSING" as const, confidence: 0, reason: "No sufficiently relevant indexed evidence was found." };
  const relevant = hits.filter((hit) => hit.score >= Math.max(0.16, hits[0]!.score * 0.72));
  if (relevant.some((hit) => hit.safetyFlags.length > 0)) {
    return { status: "MISSING" as const, confidence: 0, reason: "Retrieved text contains instruction-like content; it was isolated as untrusted and not used to make a claim." };
  }
  const hasConflictLanguage = relevant.some((hit) => conflictPattern.test(hit.chunk.content));
  const numericClaims = new Set(relevant.flatMap((hit) => numericValues(hit.chunk.content)));
  const hasDistinctNumericClaims = numericClaims.size > 1 && relevant.length > 1;
  if (hasConflictLanguage || hasDistinctNumericClaims) {
    return { status: "CONFLICTING" as const, confidence: Math.round(Math.min(99, hits[0]!.score * 100)), reason: "Relevant sources contain conflicting language or materially different numeric claims; human review is required." };
  }
  return { status: "SOURCE_BACKED" as const, confidence: Math.round(Math.min(98, 52 + hits[0]!.score * 46)), reason: "The result is supported by indexed document passages." };
}

export function buildEvidenceResult(query: string, hits: RetrievalHit[]) {
  const classification = classifyEvidence(query, hits);
  const citations: EvidenceCitation[] = hits.map((hit) => ({
    sourceDocument: hit.document.filename,
    documentId: hit.document.id,
    documentVersion: hit.document.version,
    page: typeof hit.metadata.page === "number" ? hit.metadata.page : null,
    section: hit.chunk.section,
    chunkId: hit.chunk.id,
    passage: hit.chunk.content,
    relevanceScore: Math.round(hit.score * 100),
    retrievedAt: new Date().toISOString(),
    safetyFlags: hit.safetyFlags,
    retrievalMethod: hit.retrievalMethod ?? "lexical",
  }));

  return {
    query,
    status: classification.status,
    confidence: classification.confidence,
    reason: classification.reason,
    answer: classification.status === "SOURCE_BACKED" ? hits[0]?.chunk.content ?? null : null,
    citations,
    abstained: classification.status !== "SOURCE_BACKED",
    guardrail: hits.some((hit) => hit.safetyFlags.length > 0) ? "prompt_injection_isolated" : classification.status === "CONFLICTING" ? "human_review_required" : classification.status === "MISSING" ? "do_not_invent" : "grounded_in_retrieved_text",
  };
}
