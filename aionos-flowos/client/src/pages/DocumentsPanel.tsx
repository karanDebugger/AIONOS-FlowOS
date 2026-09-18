import { useMemo, useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, CheckCircle2, Database, FileArchive, FileText, LockKeyhole, Quote, RefreshCw, Search, ShieldAlert, UploadCloud, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type EvidenceResult = {
  query: string;
  status: "SOURCE_BACKED" | "MISSING" | "CONFLICTING";
  confidence: number;
  reason: string;
  answer: string | null;
  citations: Array<{ sourceDocument: string; documentVersion: number; page: number | null; section: string | null; chunkId: string; passage: string; relevanceScore: number; safetyFlags: string[] }>;
  abstained: boolean;
  guardrail: string;
  traceId: string;
};

const documentTypes = [
  { value: "opportunity_brief", label: "Opportunity brief" },
  { value: "statement_of_work", label: "Statement of work" },
  { value: "discovery_notes", label: "Discovery notes" },
  { value: "architecture", label: "Architecture document" },
  { value: "use_case_request", label: "Internal use-case request" },
] as const;

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) {
    const part = bytes.subarray(index, Math.min(index + 0x8000, bytes.length));
    for (let offset = 0; offset < part.length; offset += 1) binary += String.fromCharCode(part[offset] ?? 0);
  }
  return btoa(binary);
}

function statusCopy(status: string) {
  if (status === "indexed") return { label: "Indexed", icon: CheckCircle2, className: "text-[#96d3aa] bg-[#96d3aa]/10" };
  if (status === "failed") return { label: "Failed", icon: XCircle, className: "text-[#ef8b8b] bg-[#ef8b8b]/10" };
  if (status === "processing") return { label: "Processing", icon: RefreshCw, className: "text-[#e49a69] bg-[#e49a69]/10" };
  return { label: "Uploaded", icon: UploadCloud, className: "text-[#aaa6ef] bg-[#aaa6ef]/10" };
}

export default function DocumentsPanel({ onBack, onWorkflowComplete }: { onBack: () => void; onWorkflowComplete?: (caseId: string) => void }) {
  const documents = trpc.flowos.documents.useQuery();
  const llmStatus = trpc.flowos.llmStatus.useQuery();
  const upload = trpc.flowos.uploadDocument.useMutation({
    onSuccess: (result) => {
      toast.success(result.deduplicated ? `${result.document.filename} already exists at this version; no duplicate created.` : `Indexed ${result.document.filename}: ${result.chunks} chunks across ${result.pages} page(s).`);
      documents.refetch();
      setFile(null);
    },
    onError: (error) => toast.error(error.message),
  });
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<(typeof documentTypes)[number]["value"]>("opportunity_brief");
  const [department, setDepartment] = useState("Operations");
  const [classification, setClassification] = useState<"internal" | "confidential" | "restricted">("internal");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const chunks = trpc.flowos.documentChunks.useQuery({ documentId: selectedDocumentId ?? "" }, { enabled: Boolean(selectedDocumentId) });
  const selectedDocument = useMemo(() => documents.data?.find((doc) => doc.id === selectedDocumentId), [documents.data, selectedDocumentId]);
  const [evidenceQuery, setEvidenceQuery] = useState("What is the accountable owner for the Okta service account?");
  const [evidenceResult, setEvidenceResult] = useState<EvidenceResult | null>(null);
  const evidenceAgent = trpc.flowos.evidenceAgent.useMutation({ onSuccess: (result) => setEvidenceResult(result as EvidenceResult), onError: (error) => toast.error(error.message) });
  const runWorkflow = trpc.flowos.runWorkflow.useMutation({ onSuccess: (result) => { toast.success(`Governed workflow created ${result.caseId}.`); onWorkflowComplete?.(result.caseId); }, onError: (error) => toast.error(error.message) });

  async function handleUpload() {
    if (!file) {
      toast.error("Choose a document before uploading.");
      return;
    }
    try {
      const contentBase64 = toBase64(await file.arrayBuffer());
      await upload.mutateAsync({
        filename: file.name,
        contentType: file.type || "application/octet-stream",
        contentBase64,
        uploadedBy: "Maya Chen",
        documentType,
        source: "flowos-upload",
        department,
        accessClassification: classification,
      });
    } catch (error) {
      if (error instanceof Error) toast.error(error.message);
    }
  }

  return (
    <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
      <div className="mb-8 flex flex-col justify-between gap-5 xl:flex-row xl:items-end">
        <div>
          <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-[11px] text-white/40 transition hover:text-white"><ArrowLeft size={13} /> Back to control tower</button>
          <div className="mb-3 flex items-center gap-2 text-[11px] text-white/38"><span className="flex items-center gap-1.5 text-[#96d3aa]"><span className="h-1.5 w-1.5 rounded-full bg-[#96d3aa] shadow-[0_0_8px_#96d3aa]" />Ingestion pipeline ready</span><span className="text-white/15">·</span><span className={cn("rounded-md border px-2 py-1 text-[9px] font-medium uppercase tracking-[0.11em]", llmStatus.data?.mode === "LIVE_LLM" ? "border-[#96d3aa]/20 bg-[#96d3aa]/10 text-[#a9e4bb]" : "border-[#aaa6ef]/20 bg-[#aaa6ef]/10 text-[#c4c1ff]")}>{llmStatus.data?.mode === "LIVE_LLM" ? "Live LLM" : "Deterministic demo mode"}</span></div>
          <h2 className="font-display text-[31px] font-semibold tracking-[-0.05em] text-white sm:text-[36px]">Documents <span className="text-[#aaa6ef]">/</span> Knowledge</h2>
          <p className="mt-2 max-w-2xl text-[13px] leading-6 text-white/43">Upload an approved source and FlowOS will store the original, normalize the text, chunk it deterministically, and retain page-level provenance for retrieval.</p>
        </div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2.5 text-[10px] text-white/45"><LockKeyhole size={14} className="text-[#96d3aa]" /> {llmStatus.data?.message ?? "Provider status loading…"}</div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(360px,0.72fr)_minmax(0,1.28fr)]">
        <Card className="border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="border-b border-white/[0.06] px-5 py-4"><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Ingest a source</CardTitle><p className="mt-1 text-[11px] text-white/38">Supported: PDF, TXT, Markdown, CSV, JSON · 15 MB limit</p></CardHeader><CardContent className="space-y-5 p-5">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-white/[0.14] bg-white/[0.02] px-5 py-8 text-center transition hover:border-[#aaa6ef]/40 hover:bg-[#aaa6ef]/[0.04]"><input type="file" accept=".pdf,.txt,.md,.csv,.json,application/pdf,text/plain,text/markdown,text/csv,application/json" className="sr-only" onChange={(event) => setFile(event.target.files?.[0] ?? null)} /><span className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-[#aaa6ef]/10 text-[#aaa6ef]"><UploadCloud size={20} /></span><span className="text-[12px] font-medium text-white/75">{file ? file.name : "Choose a synthetic source document"}</span><span className="mt-1 text-[10px] text-white/32">Drop a file here or browse from your machine</span></label>
          <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label className="text-[10px] uppercase tracking-[0.1em] text-white/35">Document type</Label><Select value={documentType} onValueChange={(value) => setDocumentType(value as typeof documentType)}><SelectTrigger className="h-9 border-white/[0.1] bg-white/[0.03] text-[11px] text-white/70"><SelectValue /></SelectTrigger><SelectContent>{documentTypes.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label className="text-[10px] uppercase tracking-[0.1em] text-white/35">Department</Label><Input value={department} onChange={(event) => setDepartment(event.target.value)} className="h-9 border-white/[0.1] bg-white/[0.03] text-[11px] text-white/70" /></div></div>
          <div className="space-y-2"><Label className="text-[10px] uppercase tracking-[0.1em] text-white/35">Access classification</Label><Select value={classification} onValueChange={(value) => setClassification(value as typeof classification)}><SelectTrigger className="h-9 border-white/[0.1] bg-white/[0.03] text-[11px] text-white/70"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="internal">Internal</SelectItem><SelectItem value="confidential">Confidential</SelectItem><SelectItem value="restricted">Restricted</SelectItem></SelectContent></Select></div>
          <Button onClick={handleUpload} disabled={upload.isPending || !file} className="w-full bg-[#aaa6ef] text-[11px] font-semibold text-[#171722] hover:bg-[#bdb9ff]">{upload.isPending ? <><RefreshCw size={14} className="mr-2 animate-spin" /> Processing and indexing…</> : <><UploadCloud size={14} className="mr-2" /> Upload and index source</>}</Button>
          <div className="rounded-xl border border-[#96d3aa]/15 bg-[#96d3aa]/[0.05] p-3.5"><div className="flex gap-2.5"><Database size={15} className="mt-0.5 shrink-0 text-[#96d3aa]" /><p className="text-[10px] leading-5 text-white/48">Every indexed chunk carries its checksum, document version, page number, character range, and direct-text provenance. No unsupported claim is invented during ingestion.</p></div></div>
        </CardContent></Card>

        <Card className="border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Knowledge sources</CardTitle><p className="mt-1 text-[11px] text-white/38">Original documents and indexed chunks</p></div><button onClick={() => documents.refetch()} className="rounded-lg p-2 text-white/35 transition hover:bg-white/[0.05] hover:text-white"><RefreshCw size={15} className={documents.isFetching ? "animate-spin" : ""} /></button></CardHeader><CardContent className="p-0">{documents.isLoading ? <div className="flex items-center justify-center px-5 py-16 text-[11px] text-white/35"><RefreshCw size={14} className="mr-2 animate-spin" />Loading knowledge sources…</div> : documents.data?.length ? <div className="divide-y divide-white/[0.05]">{documents.data.map((doc) => { const status = statusCopy(doc.processingStatus); const StatusIcon = status.icon; return <button key={doc.id} onClick={() => setSelectedDocumentId(doc.id)} className={cn("flex w-full items-center gap-4 px-5 py-4 text-left transition hover:bg-white/[0.025]", selectedDocumentId === doc.id && "bg-[#aaa6ef]/[0.04]")}><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.05] text-white/45"><FileText size={17} /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-[12px] font-medium text-white/78">{doc.filename}</p><Badge className={cn("rounded px-1.5 py-0.5 text-[8px] font-medium", status.className)}><StatusIcon size={10} className={cn("mr-1", doc.processingStatus === "processing" && "animate-spin")} />{status.label}</Badge></div><p className="mt-1 truncate text-[10px] text-white/32">{doc.documentType.replaceAll("_", " ")} · {doc.department} · v{doc.version}</p></div><div className="hidden text-right sm:block"><p className="text-[10px] text-white/45">{doc.accessClassification}</p><p className="mt-1 font-mono text-[9px] text-white/22">{doc.checksum.slice(0, 12)}…</p></div></button>})}</div> : <div className="flex flex-col items-center justify-center px-5 py-16 text-center"><FileArchive size={26} className="mb-3 text-white/20" /><p className="text-[12px] text-white/55">No sources indexed yet</p><p className="mt-1 max-w-xs text-[10px] leading-5 text-white/30">Upload the synthetic opportunity brief to create the first evidence-ready knowledge source.</p></div>}</CardContent></Card>
      </div>

      <Card className="mt-5 border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Evidence Agent</CardTitle><p className="mt-1 text-[11px] text-white/38">Cited retrieval over indexed sources · no evidence, no invention</p></div><ShieldAlert size={16} className="text-[#aaa6ef]" /></CardHeader><CardContent className="p-5"><div className="flex flex-col gap-3 md:flex-row"><div className="relative flex-1"><Search size={14} className="absolute left-3 top-3 text-white/25" /><Input value={evidenceQuery} onChange={(event) => setEvidenceQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && evidenceQuery.trim().length > 1) evidenceAgent.mutate({ query: evidenceQuery.trim(), caseId: "case-001" }); }} className="h-10 border-white/[0.1] bg-white/[0.03] pl-9 text-[11px] text-white/75" placeholder="Ask about an outcome, owner, dependency, or policy…" /></div><Button onClick={() => evidenceAgent.mutate({ query: evidenceQuery.trim(), caseId: "case-001" })} disabled={evidenceAgent.isPending || evidenceQuery.trim().length < 2} className="h-10 bg-[#aaa6ef] text-[11px] font-semibold text-[#171722] hover:bg-[#bdb9ff]">{evidenceAgent.isPending ? <><RefreshCw size={14} className="mr-2 animate-spin" /> Retrieving…</> : "Retrieve evidence"}</Button></div>{evidenceResult && <div className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2"><Badge className={cn("rounded px-1.5 py-0.5 text-[9px] font-medium", evidenceResult.status === "SOURCE_BACKED" ? "bg-[#96d3aa]/10 text-[#96d3aa]" : evidenceResult.status === "CONFLICTING" ? "bg-[#ef8b8b]/10 text-[#ef8b8b]" : "bg-[#e49a69]/10 text-[#e49a69]")}>{evidenceResult.status}</Badge><span className="text-[10px] text-white/35">{evidenceResult.confidence}% confidence · trace {evidenceResult.traceId}</span></div><span className="text-[10px] text-white/35">{evidenceResult.guardrail.replaceAll("_", " ")}</span></div><p className="mt-3 text-[11px] leading-5 text-white/55">{evidenceResult.answer ?? evidenceResult.reason}</p>{evidenceResult.citations.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2">{evidenceResult.citations.map((citation) => <div key={citation.chunkId} className="rounded-lg border border-white/[0.06] bg-black/10 p-3"><div className="mb-2 flex items-center gap-2 text-[9px] uppercase tracking-[0.08em] text-white/30"><Quote size={11} className="text-[#aaa6ef]" />{citation.sourceDocument} · v{citation.documentVersion}{citation.page ? ` · p.${citation.page}` : ""}</div><p className="line-clamp-3 text-[10px] leading-5 text-white/48">{citation.passage}</p><div className="mt-2 flex items-center justify-between text-[9px] text-white/25"><span>{citation.relevanceScore}% relevance</span><span>{citation.safetyFlags.length ? "Untrusted text isolated" : "Direct source passage"}</span></div></div>)}</div>}{evidenceResult.abstained && <div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-3 text-[10px] text-[#f2c19a]"><ShieldAlert size={13} /> FlowOS abstained from making a claim; review the cited sources or add a better document.</div>}</div>}</CardContent></Card>

      {selectedDocument && <Card className="mt-5 border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-col gap-3 border-b border-white/[0.06] px-5 py-4 sm:flex-row sm:items-start sm:justify-between"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Indexed chunk preview</CardTitle><p className="mt-1 text-[11px] text-white/38">{selectedDocument.filename} · checksum {selectedDocument.checksum.slice(0, 18)}…</p></div><div className="flex items-center gap-2"><Button onClick={() => runWorkflow.mutate({ documentId: selectedDocument.id, actor: "Maya Chen", caseName: selectedDocument.filename.replace(/\.[^.]+$/, "") })} disabled={runWorkflow.isPending || selectedDocument.processingStatus !== "indexed"} className="h-8 bg-[#aaa6ef] text-[10px] font-semibold text-[#171722] hover:bg-[#bdb9ff]">{runWorkflow.isPending ? <><RefreshCw size={12} className="mr-1.5 animate-spin" /> Running agents…</> : "Run governed workflow"}</Button><button onClick={() => setSelectedDocumentId(null)} className="rounded-lg p-1.5 text-white/35 hover:bg-white/[0.05] hover:text-white"><XCircle size={16} /></button></div></CardHeader><CardContent className="p-5">{chunks.isLoading ? <div className="text-[11px] text-white/35">Loading chunks…</div> : chunks.data?.length ? <div className="grid gap-3 md:grid-cols-2">{chunks.data.map((chunk) => { const metadata = JSON.parse(chunk.metadata) as { page?: number; charStart?: number; charEnd?: number; provenance?: string }; return <div key={chunk.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4"><div className="mb-3 flex items-center justify-between text-[9px] uppercase tracking-[0.1em] text-white/30"><span>Chunk {chunk.chunkIndex + 1}</span><span>{metadata.page ? `Page ${metadata.page}` : "Text source"}</span></div><p className="line-clamp-5 text-[11px] leading-5 text-white/58">{chunk.content}</p><div className="mt-3 flex items-center justify-between border-t border-white/[0.05] pt-2.5 text-[9px] text-white/25"><span>Chars {metadata.charStart}–{metadata.charEnd}</span><span>{metadata.provenance}</span></div></div>})}</div> : <div className="text-[11px] text-white/35">No indexed chunks available for this source.</div>}</CardContent></Card>}
    </div>
  );
}
