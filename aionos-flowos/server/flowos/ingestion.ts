import { createHash } from "node:crypto";
import { extname } from "node:path";
import { nanoid } from "nanoid";
import { PDFParse } from "pdf-parse";
import { createKnowledgeSources, createFlowDocument, updateFlowDocument, findDocumentByChecksum, findLatestDocumentVersion } from "../db";
import { deterministicEmbedding } from "./llm-gateway";
import { storagePut } from "../storage";

export const SUPPORTED_DOCUMENT_EXTENSIONS = [".pdf", ".txt", ".md", ".csv", ".json"] as const;
const MAX_DOCUMENT_BYTES = 15 * 1024 * 1024;
const CHUNK_SIZE = 1400;
const CHUNK_OVERLAP = 180;

type ParsedPage = { page: number; text: string };

export type IngestDocumentInput = {
  filename: string;
  contentType: string;
  bytes: Buffer;
  uploadedBy: string;
  documentType: "opportunity_brief" | "statement_of_work" | "discovery_notes" | "architecture" | "use_case_request";
  source: string;
  department: string;
  accessClassification: "public" | "internal" | "confidential" | "restricted";
  tenantKey?: string;
  storageKey?: string;
};

export function calculateChecksum(bytes: Buffer) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function isSupportedDocument(filename: string, contentType: string) {
  const extension = extname(filename).toLowerCase();
  return SUPPORTED_DOCUMENT_EXTENSIONS.includes(extension as (typeof SUPPORTED_DOCUMENT_EXTENSIONS)[number]) || contentType === "application/pdf" || contentType.startsWith("text/");
}

function normalizeText(text: string) {
  return text
    .replace(/\u0000/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\t ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function parseDocument(bytes: Buffer, filename: string, contentType: string): Promise<ParsedPage[]> {
  const extension = extname(filename).toLowerCase();
  if (extension === ".pdf" || contentType === "application/pdf") {
    const parser = new PDFParse({ data: bytes });
    try {
      const result = await parser.getText();
      return result.pages.map((page) => ({ page: page.num, text: normalizeText(page.text) })).filter((page) => page.text.length > 0);
    } finally {
      await parser.destroy();
    }
  }

  const text = normalizeText(bytes.toString("utf8"));
  return text ? [{ page: 1, text }] : [];
}

function chunkPage(page: ParsedPage) {
  const chunks: Array<{ content: string; start: number; end: number }> = [];
  let start = 0;
  while (start < page.text.length) {
    const requestedEnd = Math.min(start + CHUNK_SIZE, page.text.length);
    let end = requestedEnd;
    if (requestedEnd < page.text.length) {
      const paragraphBreak = page.text.lastIndexOf("\n\n", requestedEnd);
      const lineBreak = page.text.lastIndexOf("\n", requestedEnd);
      end = paragraphBreak > start + 300 ? paragraphBreak : lineBreak > start + 300 ? lineBreak : requestedEnd;
    }
    const content = page.text.slice(start, end).trim();
    if (content) chunks.push({ content, start, end });
    if (end >= page.text.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }
  return chunks;
}

export function buildKnowledgeChunks(pages: ParsedPage[], documentId: string, documentVersion: number, filename: string, contentType: string, checksum: string, tenantKey = "demo") {
  return pages.flatMap((page) => chunkPage(page).map((chunk, index) => ({
    id: `chunk-${nanoid(12)}`,
    documentId,
    tenantKey,
    documentVersion,
    chunkIndex: index,
    section: `Page ${page.page}`,
    content: chunk.content,
    metadata: JSON.stringify({ filename, contentType, checksum, page: page.page, charStart: chunk.start, charEnd: chunk.end, version: documentVersion, provenance: "direct_document_text", retrievalMethod: "deterministic_embedding_plus_lexical" }),
    embedding: JSON.stringify(deterministicEmbedding(chunk.content).vector),
    embeddingModel: deterministicEmbedding(chunk.content).model,
    embeddingChecksum: deterministicEmbedding(chunk.content).checksum,
    embeddingStatus: "indexed" as const,
    embeddingDimensions: deterministicEmbedding(chunk.content).dimensions,
  })));
}

export async function ingestDocument(input: IngestDocumentInput) {
  if (input.bytes.byteLength === 0) throw new Error("Document is empty");
  if (input.bytes.byteLength > MAX_DOCUMENT_BYTES) throw new Error("Document exceeds the 15 MB ingestion limit");
  if (!isSupportedDocument(input.filename, input.contentType)) throw new Error("Unsupported document format; use PDF, TXT, Markdown, CSV, or JSON");

  const checksum = calculateChecksum(input.bytes);
  const tenantKey = input.tenantKey ?? "demo";
  const duplicate = await findDocumentByChecksum(checksum, tenantKey);
  if (duplicate) return { document: duplicate, pages: 0, chunks: 0, checksum, storageKey: duplicate.storageKey, deduplicated: true };
  const previousVersion = await findLatestDocumentVersion(input.filename, tenantKey);
  const documentId = `doc-${nanoid(10)}`;
  const nextVersion = (previousVersion?.version ?? 0) + 1;
  const baseKey = `flowos/documents/${tenantKey}/${documentId}/${nanoid(8)}-${input.filename.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const created = await createFlowDocument({
    id: documentId,
    filename: input.filename,
    documentType: input.documentType,
    uploadedBy: input.uploadedBy,
    source: input.source,
    department: input.department,
    accessClassification: input.accessClassification,
    tenantKey,
    supersedesId: previousVersion?.id ?? null,
    checksum,
    storageKey: null,
    version: nextVersion,
    processingStatus: "processing",
  });

  try {
    const stored = input.storageKey ? { key: input.storageKey, url: `/manus-storage/${input.storageKey}` } : await storagePut(baseKey, input.bytes, input.contentType || "application/octet-stream");
    await updateFlowDocument(documentId, { storageKey: stored.key, processingStatus: "processing" });
    const pages = await parseDocument(input.bytes, input.filename, input.contentType);
    if (pages.length === 0) throw new Error("No readable text found in document");
    const chunks = buildKnowledgeChunks(pages, documentId, nextVersion, input.filename, input.contentType, checksum, tenantKey);
    await createKnowledgeSources(chunks);
    const indexed = await updateFlowDocument(documentId, { storageKey: stored.key, processingStatus: "indexed" });
    return { document: { ...created, ...indexed }, pages: pages.length, chunks: chunks.length, checksum, storageKey: stored.key, deduplicated: false, embeddingModel: "flowos-deterministic-v1" };
  } catch (error) {
    await updateFlowDocument(documentId, { processingStatus: "failed" });
    throw error;
  }
}
