import { describe, expect, it } from "vitest";
import { buildKnowledgeChunks, calculateChecksum, isSupportedDocument, parseDocument } from "./ingestion";

describe("FlowOS document ingestion", () => {
  it("calculates a stable checksum and rejects unsupported formats", () => {
    const bytes = Buffer.from("Outcome: reduce triage time", "utf8");
    expect(calculateChecksum(bytes)).toHaveLength(64);
    expect(calculateChecksum(bytes)).toBe(calculateChecksum(Buffer.from("Outcome: reduce triage time", "utf8")));
    expect(isSupportedDocument("brief.pdf", "application/pdf")).toBe(true);
    expect(isSupportedDocument("brief.txt", "text/plain")).toBe(true);
    expect(isSupportedDocument("brief.exe", "application/octet-stream")).toBe(false);
  });

  it("parses text without inventing pages or content", async () => {
    const pages = await parseDocument(Buffer.from("Outcome: reduce triage time\n\nOwner: Support Operations", "utf8"), "brief.txt", "text/plain");
    expect(pages).toEqual([{ page: 1, text: "Outcome: reduce triage time\n\nOwner: Support Operations" }]);
  });

  it("creates deterministic page-aware knowledge metadata", async () => {
    const pages = await parseDocument(Buffer.from("A".repeat(1800), "utf8"), "brief.md", "text/markdown");
    const chunks = buildKnowledgeChunks(pages, "doc-demo", 2, "brief.md", "text/markdown", "checksum-demo");

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.documentId).toBe("doc-demo");
    expect(JSON.parse(chunks[0]?.metadata ?? "{}")).toMatchObject({
      filename: "brief.md",
      page: 1,
      version: 2,
      checksum: "checksum-demo",
      provenance: "direct_document_text",
    });
    expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true);
  });
});
