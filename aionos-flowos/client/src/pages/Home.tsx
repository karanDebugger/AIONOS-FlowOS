import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  ArrowUpRight,
  Bot,
  Check,
  ChevronDown,
  CircleDot,
  Clock3,
  Command,
  FileCheck2,
  FileText,
  GitBranch,
  Inbox,
  LayoutDashboard,
  LifeBuoy,
  LockKeyhole,
  Menu,
  MoreHorizontal,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import DocumentsPanel from "@/pages/DocumentsPanel";
import { AgentActivityView, ApprovalInboxView, CaseDetailView, EvaluationView, PolicyView, TelemetryView } from "@/pages/FlowOSViews";

const statusStyles: Record<string, string> = {
  "Needs decision": "bg-[#f5d7b7]/10 text-[#f5c28e] border-[#f5d7b7]/20",
  "At risk": "bg-[#dd7d6b]/10 text-[#f09787] border-[#dd7d6b]/20",
  "In review": "bg-[#aaa6ef]/10 text-[#aaa6ef] border-[#aaa6ef]/20",
  "On track": "bg-[#8dc4a2]/10 text-[#a9d7b7] border-[#8dc4a2]/20",
};

const evidenceStyles: Record<string, { label: string; className: string; dot: string }> = {
  backed: { label: "SOURCE-BACKED", className: "text-[#96d3aa] bg-[#96d3aa]/10", dot: "bg-[#96d3aa]" },
  inferred: { label: "INFERRED", className: "text-[#aaa6ef] bg-[#aaa6ef]/10", dot: "bg-[#aaa6ef]" },
  missing: { label: "MISSING", className: "text-[#f2a07d] bg-[#f2a07d]/10", dot: "bg-[#f2a07d]" },
  conflict: { label: "CONFLICT", className: "text-[#ef8b8b] bg-[#ef8b8b]/10", dot: "bg-[#ef8b8b]" },
};

function MetricCard({ label, value, detail, icon: Icon, tone = "lavender" }: { label: string; value: string | number; detail: string; icon: typeof Activity; tone?: string }) {
  return (
    <Card className="min-w-0 border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]">
      <CardContent className="p-5">
        <div className="mb-6 flex items-start justify-between">
          <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-white/45">{label}</p>
          <div className={cn("rounded-lg p-2", tone === "orange" ? "bg-[#e49a69]/10 text-[#e49a69]" : tone === "green" ? "bg-[#96d3aa]/10 text-[#96d3aa]" : "bg-[#aaa6ef]/10 text-[#aaa6ef]")}>
            <Icon size={16} strokeWidth={1.8} />
          </div>
        </div>
        <div className="flex items-end justify-between gap-2">
          <p className="font-display text-[30px] font-semibold leading-none tracking-[-0.05em] text-white">{value}</p>
          <span className="mb-0.5 text-[11px] text-white/42">{detail}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Sidebar({ active, setActive, collapsed, setCollapsed }: { active: string; setActive: (value: string) => void; collapsed: boolean; setCollapsed: (value: boolean) => void }) {
  const nav = [
    { label: "Control tower", icon: LayoutDashboard },
    { label: "Handoff cases", icon: GitBranch, count: "14" },
    { label: "Approval inbox", icon: Inbox, count: "3" },
    { label: "Evidence library", icon: FileCheck2 },
    { label: "Documents / Knowledge", icon: FileText },
    { label: "Dependencies", icon: Network },
  ];
  const secondary = [
    { label: "Agent activity", icon: Bot },
    { label: "Run-state / Telemetry", icon: Activity },
    { label: "Policy & guardrails", icon: ShieldCheck },
    { label: "Evaluation dashboard", icon: FileCheck2 },
    { label: "Integrations", icon: Zap },
  ];
  return (
    <aside className={cn("hidden shrink-0 flex-col border-r border-white/[0.06] bg-[#101119] transition-[width] duration-200 lg:flex", collapsed ? "w-[76px]" : "w-[236px]")}>
      <div className={cn("flex h-[74px] items-center border-b border-white/[0.06]", collapsed ? "justify-center" : "justify-between px-5")}>
        <button className="flex items-center gap-3" onClick={() => setCollapsed(!collapsed)} aria-label="Toggle sidebar">
          <div className="relative flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#aaa6ef] text-[#161620] shadow-[0_0_22px_rgba(170,166,239,0.3)]">
            <span className="font-display text-[17px] font-bold">F</span>
            <span className="absolute -bottom-1 -right-1 h-2 w-2 rounded-full border-2 border-[#101119] bg-[#96d3aa]" />
          </div>
          {!collapsed && <span className="font-display text-[17px] font-semibold tracking-[-0.03em] text-white">FlowOS</span>}
        </button>
        {!collapsed && <button className="text-white/30 transition hover:text-white" onClick={() => setCollapsed(true)}><PanelLeftClose size={16} /></button>}
      </div>
      <div className="flex-1 px-3 py-5">
        {!collapsed && <p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-white/25">Workspace</p>}
        <div className="space-y-1">
          {nav.map(({ label, icon: Icon, count }) => <button key={label} onClick={() => setActive(label)} className={cn("group flex w-full items-center rounded-lg text-left text-[12px] transition", collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5", active === label ? "bg-white/[0.08] text-white" : "text-white/48 hover:bg-white/[0.04] hover:text-white/80")} title={collapsed ? label : undefined}>
            <Icon size={16} strokeWidth={active === label ? 2 : 1.7} className={active === label ? "text-[#aaa6ef]" : "text-white/42"} />
            {!collapsed && <><span className="flex-1">{label}</span>{count && <span className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-white/55">{count}</span>}</>}
          </button>)}
        </div>
        {!collapsed && <p className="mb-3 mt-9 px-3 text-[10px] font-semibold uppercase tracking-[0.17em] text-white/25">System</p>}
        <div className="space-y-1">
          {secondary.map(({ label, icon: Icon }) => <button key={label} onClick={() => setActive(label)} className={cn("group flex w-full items-center rounded-lg text-left text-[12px] text-white/48 transition hover:bg-white/[0.04] hover:text-white/80", collapsed ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5")} title={collapsed ? label : undefined}>
            <Icon size={16} className="text-white/35" />{!collapsed && <span>{label}</span>}
          </button>)}
        </div>
      </div>
      <div className={cn("border-t border-white/[0.06] p-3", collapsed && "flex justify-center")}>
        <button className={cn("flex items-center gap-3 rounded-lg p-2 text-left transition hover:bg-white/[0.05]", collapsed && "justify-center")} onClick={() => toast.info("Profile settings are coming next.")}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#d8b79b] text-[11px] font-semibold text-[#2a1f1a]">MC</div>
          {!collapsed && <div><p className="text-[12px] font-medium text-white/80">Maya Chen</p><p className="text-[10px] text-white/35">Solution lead</p></div>}
        </button>
      </div>
    </aside>
  );
}

export default function Home() {
  const { data, isLoading, refetch } = trpc.flowos.dashboard.useQuery();
  const approve = trpc.flowos.approve.useMutation({ onSuccess: (result) => { toast.success(result.message); refetch(); } });
  const simulate = trpc.flowos.simulateRun.useMutation({ onSuccess: (result) => toast.success(result.event) });
  const [active, setActive] = useState("Control tower");
  const [collapsed, setCollapsed] = useState(false);
  const [selectedId, setSelectedId] = useState("case-001");
  const [showCommand, setShowCommand] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const onWorkflowComplete = (caseId: string) => { setSelectedId(caseId); setActive("Handoff cases"); };

  const selectedCase = useMemo(() => data?.cases.find((item) => item.id === selectedId) ?? data?.cases[0], [data, selectedId]);

  if (isLoading || !data || !selectedCase) return <div className="flex min-h-screen items-center justify-center bg-[#0d0e14] text-sm text-white/50"><div className="mr-3 h-4 w-4 animate-spin rounded-full border-2 border-white/15 border-t-[#aaa6ef]" />Booting FlowOS control plane…</div>;

  return (
    <div className="min-h-screen bg-[#0d0e14] text-white selection:bg-[#aaa6ef]/30">
      <div className="flex min-h-screen">
        <Sidebar active={active} setActive={setActive} collapsed={collapsed} setCollapsed={setCollapsed} />
        <main className="min-w-0 flex-1">
          <header className="flex h-[74px] items-center justify-between border-b border-white/[0.06] px-5 sm:px-8">
            <div className="flex items-center gap-3"><button className="text-white/55 lg:hidden" onClick={() => setMobileNav(!mobileNav)}><Menu size={20} /></button><div><div className="flex items-center gap-2"><span className="text-[11px] uppercase tracking-[0.13em] text-white/35">AIONOS / Operations</span><span className="text-white/15">/</span><span className="text-[11px] text-white/60">Control tower</span></div><h1 className="mt-1 font-display text-[18px] font-medium tracking-[-0.02em] text-white">Outcome-to-operations overview</h1></div></div>
            <div className="flex items-center gap-2 sm:gap-3"><button onClick={() => setShowCommand(true)} className="hidden items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[11px] text-white/42 transition hover:border-white/15 hover:text-white/70 sm:flex"><Search size={14} /> Search <kbd className="ml-3 rounded border border-white/10 px-1.5 py-0.5 font-mono text-[9px] text-white/25">⌘ K</kbd></button><button onClick={() => toast.info("Invite flow is ready for the next release.")} className="flex items-center gap-2 rounded-lg bg-[#aaa6ef] px-3 py-2 text-[11px] font-semibold text-[#171722] transition hover:bg-[#bdb9ff] active:scale-[0.97]"><Plus size={14} /> <span className="hidden sm:inline">New handoff</span></button><button onClick={() => toast.info("No unread notifications.")} className="relative rounded-lg p-2 text-white/45 transition hover:bg-white/[0.05] hover:text-white"><Activity size={17} /><span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[#e49a69]" /></button></div>
          </header>
          {mobileNav && <div className="border-b border-white/[0.06] bg-[#101119] p-3 lg:hidden"><div className="grid grid-cols-2 gap-2">{["Control tower", "Handoff cases", "Approval inbox", "Evidence library", "Documents / Knowledge", "Dependencies", "Agent activity", "Run-state / Telemetry", "Policy & guardrails", "Evaluation dashboard"].map((item) => <button key={item} onClick={() => { setActive(item); setMobileNav(false); }} className="rounded-lg bg-white/[0.04] px-3 py-2 text-left text-xs text-white/65">{item}</button>)}</div></div>}
          {active === "Documents / Knowledge" || active === "Evidence library" ? <DocumentsPanel onBack={() => setActive("Control tower")} onWorkflowComplete={onWorkflowComplete} /> : active === "Handoff cases" ? <CaseDetailView caseId={selectedId} onBack={() => setActive("Control tower")} onNavigate={setActive} /> : active === "Approval inbox" ? <ApprovalInboxView caseId={selectedId} onBack={() => setActive("Control tower")} onNavigate={setActive} /> : active === "Dependencies" ? <CaseDetailView caseId={selectedId} onBack={() => setActive("Control tower")} onNavigate={setActive} /> : active === "Agent activity" ? <AgentActivityView caseId={selectedId} onBack={() => setActive("Control tower")} onNavigate={setActive} /> : active === "Run-state / Telemetry" ? <TelemetryView caseId={selectedId} onBack={() => setActive("Control tower")} onNavigate={setActive} /> : active === "Policy & guardrails" ? <PolicyView caseId={selectedId} onBack={() => setActive("Control tower")} onNavigate={setActive} /> : active === "Evaluation dashboard" ? <EvaluationView caseId={selectedId} onBack={() => setActive("Control tower")} onNavigate={setActive} /> : <div className="mx-auto max-w-[1500px] px-5 py-7 sm:px-8 lg:px-10">
            <div className="mb-8 flex flex-col justify-between gap-5 xl:flex-row xl:items-end"><div><div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] text-white/38"><span className="flex items-center gap-1.5 text-[#96d3aa]"><span className="h-1.5 w-1.5 rounded-full bg-[#96d3aa] shadow-[0_0_8px_#96d3aa]" />All systems operational</span><span className="text-white/15">·</span><span>Last synced 12 min ago</span><span className="rounded-md border border-[#aaa6ef]/20 bg-[#aaa6ef]/10 px-2 py-1 text-[9px] font-medium uppercase tracking-[0.11em] text-[#c4c1ff]">Demo / synthetic data</span></div><h2 className="font-display text-[31px] font-semibold tracking-[-0.05em] text-white sm:text-[36px]">Good morning, Maya <span className="text-[#aaa6ef]">↗</span></h2><p className="mt-2 max-w-xl text-[13px] leading-6 text-white/43">See what is blocking the path from a promised outcome to a service that can run safely.</p></div><div className="flex items-center gap-2"><Button variant="outline" onClick={() => toast.info("Filters are available on the handoff queue.")} className="h-9 border-white/[0.1] bg-white/[0.02] text-[11px] text-white/60 hover:bg-white/[0.06] hover:text-white"><span className="mr-2">This week</span><ChevronDown size={13} /></Button><Button variant="outline" onClick={() => toast.info("Export prepared for the audit workspace.")} className="h-9 border-white/[0.1] bg-white/[0.02] text-[11px] text-white/60 hover:bg-white/[0.06] hover:text-white"><ArrowUpRight size={13} className="mr-2" /> Export view</Button></div></div>

            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Active handoffs" value={data.kpis.activeHandoffs} detail={data.kpis.activeHandoffsDelta} icon={GitBranch} /><MetricCard label="Critical blockers" value={data.kpis.criticalBlockers} detail="2 need an owner" icon={AlertCircle} tone="orange" /><MetricCard label="Evidence coverage" value={`${data.kpis.evidenceCoverage}%`} detail="+8% vs last week" icon={FileCheck2} tone="green" /><MetricCard label="Approval latency" value={data.kpis.approvalLatency} detail="-0.6d vs baseline" icon={Clock3} /></section>

            <section className="mt-7 grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(330px,0.75fr)]">
              <Card className="overflow-hidden border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Handoff queue</CardTitle><p className="mt-1 text-[11px] text-white/38">Where outcome cases stand today</p></div><button onClick={() => setActive("Handoff cases")} className="flex items-center gap-1 text-[11px] text-[#aaa6ef] hover:text-white">View all <ArrowUpRight size={13} /></button></CardHeader><CardContent className="p-0"><div className="hidden grid-cols-[1.6fr_1fr_0.7fr_0.8fr_0.8fr] gap-3 border-b border-white/[0.05] px-5 py-3 text-[10px] uppercase tracking-[0.12em] text-white/25 md:grid"><span>Case</span><span>Owners</span><span>Readiness</span><span>Status</span><span>Target</span></div>{data.cases.map((item) => <button key={item.id} onClick={() => setSelectedId(item.id)} className={cn("grid w-full grid-cols-1 gap-3 border-b border-white/[0.05] px-5 py-4 text-left transition last:border-b-0 hover:bg-white/[0.025] md:grid-cols-[1.6fr_1fr_0.7fr_0.8fr_0.8fr] md:items-center", selectedId === item.id && "bg-[#aaa6ef]/[0.035]")}><div className="min-w-0"><div className="flex items-center gap-2"><span className={cn("h-1.5 w-1.5 rounded-full", item.status === "On track" ? "bg-[#96d3aa]" : item.status === "Needs decision" ? "bg-[#e49a69]" : "bg-[#ef8b8b]")} /><span className="truncate text-[13px] font-medium text-white/85">{item.name}</span></div><p className="mt-1 truncate pl-3.5 text-[10px] text-white/32">{item.account} · {item.blocker}</p></div><div className="flex items-center gap-2 text-[11px] text-white/55"><div className="flex -space-x-1.5"><span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#13141d] bg-[#c4a98f] text-[8px] font-bold text-[#332720]">{item.owner.split(" ").map((part) => part[0]).join("")}</span><span className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-[#13141d] bg-[#8497b8] text-[8px] font-bold text-[#172034]">{item.deliveryOwner.split(" ").map((part) => part[0]).join("")}</span></div><span className="hidden xl:inline">{item.owner.split(" ")[0]} + 1</span></div><div><div className="mb-1 flex justify-between text-[10px] text-white/38"><span>{item.readiness}%</span><span>ready</span></div><Progress value={item.readiness} className="h-1 bg-white/[0.08] [&>div]:bg-[#aaa6ef]" /></div><div><Badge variant="outline" className={cn("rounded-md border px-2 py-1 text-[9px] font-medium", statusStyles[item.status])}>{item.status}</Badge></div><div className="text-[11px] text-white/55">{item.due}</div></button>)}</CardContent></Card>

              <Card className="border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Needs your decision</CardTitle><p className="mt-1 text-[11px] text-white/38">Human gates FlowOS will not cross</p></div><div className="rounded-lg bg-[#e49a69]/10 p-2 text-[#e49a69]"><Inbox size={16} /></div></CardHeader><CardContent className="space-y-3 p-4">{data.approvals.map((approval) => <div key={approval.id} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3.5"><div className="mb-2 flex items-start justify-between gap-2"><div className="flex gap-2"><div className="mt-0.5 rounded-md bg-[#e49a69]/10 p-1.5 text-[#e49a69]"><LockKeyhole size={13} /></div><div><p className="text-[12px] font-medium leading-5 text-white/80">{approval.title}</p><p className="text-[10px] text-white/35">{approval.type} · {approval.age} old</p></div></div><span className={cn("rounded px-1.5 py-0.5 text-[9px] uppercase tracking-[0.08em]", approval.priority === "High" ? "bg-[#ef8b8b]/10 text-[#ef8b8b]" : "bg-[#e49a69]/10 text-[#e49a69]")}>{approval.priority}</span></div><div className="flex items-center justify-between border-t border-white/[0.05] pt-2.5"><span className="text-[10px] text-white/38">Owner <span className="text-white/65">{approval.owner}</span></span><div className="flex gap-1.5"><button onClick={() => toast.info("Decision packet opened with evidence and policy context.")} className="rounded-md border border-white/[0.08] px-2 py-1 text-[10px] text-white/50 hover:bg-white/[0.06] hover:text-white">Review</button><button disabled={approve.isPending} onClick={() => approve.mutate({ approvalId: approval.id })} className="rounded-md bg-[#aaa6ef]/15 px-2 py-1 text-[10px] text-[#c2bfff] hover:bg-[#aaa6ef]/25">Approve</button></div></div></div>)}<button onClick={() => setActive("Approval inbox")} className="flex w-full items-center justify-center gap-1.5 pt-1 text-[11px] text-white/40 hover:text-white">Open approval inbox <ArrowUpRight size={13} /></button></CardContent></Card>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(280px,0.7fr)]">
              <Card className="border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Selected case</CardTitle><p className="mt-1 text-[11px] text-white/38">{selectedCase.id.toUpperCase()} · {selectedCase.updated}</p></div><button onClick={() => toast.info("Case detail view is being expanded from this control tower.")} className="rounded-md p-1.5 text-white/35 hover:bg-white/[0.05] hover:text-white"><MoreHorizontal size={16} /></button></CardHeader><CardContent className="p-5"><div className="mb-4 flex items-start justify-between gap-4"><div><p className="text-[15px] font-medium text-white/90">{selectedCase.name}</p><p className="mt-1 text-[11px] text-white/38">{selectedCase.account}</p></div><Badge variant="outline" className={cn("rounded-md border px-2 py-1 text-[9px]", statusStyles[selectedCase.status])}>{selectedCase.status}</Badge></div><div className="rounded-xl border border-[#e49a69]/15 bg-[#e49a69]/[0.06] p-3.5"><div className="flex gap-2.5"><AlertCircle size={15} className="mt-0.5 shrink-0 text-[#e49a69]" /><div><p className="text-[11px] font-medium text-[#f2c19a]">Critical path is waiting</p><p className="mt-1 text-[11px] leading-5 text-white/48">{selectedCase.blocker}. The dependency agent predicts a 2–3 day slip if ownership is not assigned.</p></div></div></div><div className="mt-5 grid grid-cols-2 gap-3"><div><p className="text-[10px] uppercase tracking-[0.1em] text-white/30">Readiness</p><p className="mt-1 text-[22px] font-semibold text-white">{selectedCase.readiness}%</p></div><div><p className="text-[10px] uppercase tracking-[0.1em] text-white/30">Target handoff</p><p className="mt-1 text-[15px] font-medium text-white/75">{selectedCase.due}</p></div></div><div className="mt-4 flex items-center gap-2 border-t border-white/[0.06] pt-4"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#c4a98f] text-[8px] font-bold text-[#332720]">MC</span><span className="text-[11px] text-white/50">{selectedCase.owner}</span><span className="text-white/20">→</span><span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#8497b8] text-[8px] font-bold text-[#172034]">AN</span><span className="text-[11px] text-white/50">{selectedCase.deliveryOwner}</span></div></CardContent></Card>

              <Card className="border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Evidence ledger</CardTitle><p className="mt-1 text-[11px] text-white/38">Every field keeps its provenance</p></div><FileCheck2 size={16} className="text-[#96d3aa]" /></CardHeader><CardContent className="space-y-3 p-4">{data.evidence.slice(0, 4).map((item) => { const style = evidenceStyles[item.status]; return <button key={item.id} onClick={() => toast.info(`${item.field}: ${item.excerpt}`)} className="group w-full text-left"><div className="mb-1.5 flex items-center justify-between gap-2"><span className="text-[11px] font-medium text-white/70">{item.field}</span><span className={cn("rounded px-1.5 py-0.5 text-[8px] font-medium tracking-[0.08em]", style.className)}><span className={cn("mr-1 inline-block h-1 w-1 rounded-full", style.dot)} />{style.label}</span></div><p className="line-clamp-1 text-[11px] text-white/42 transition group-hover:text-white/70">{item.value}</p><div className="mt-2 flex items-center justify-between text-[9px] text-white/25"><span>{item.source}</span><span>{item.confidence}% confidence</span></div></button> })}<button onClick={() => setActive("Evidence library")} className="flex w-full items-center justify-center gap-1.5 border-t border-white/[0.06] pt-3 text-[11px] text-white/40 hover:text-white">Open evidence library <ArrowUpRight size={13} /></button></CardContent></Card>

              <Card className="border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-start justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Run-state pulse</CardTitle><p className="mt-1 text-[11px] text-white/38">Pilot telemetry · shadow mode</p></div><Activity size={16} className="text-[#aaa6ef]" /></CardHeader><CardContent className="p-5"><div className="space-y-5">{data.runState.map((metric) => <div key={metric.label}><div className="mb-2 flex items-center justify-between"><span className="text-[11px] text-white/55">{metric.label}</span><span className={cn("text-[11px] font-medium", metric.tone === "good" ? "text-[#96d3aa]" : metric.tone === "warn" ? "text-[#e49a69]" : "text-[#ef8b8b]")}>{metric.display}</span></div><Progress value={metric.value} className={cn("h-1.5 bg-white/[0.08]", metric.tone === "good" ? "[&>div]:bg-[#96d3aa]" : metric.tone === "warn" ? "[&>div]:bg-[#e49a69]" : "[&>div]:bg-[#ef8b8b]")} /></div>)}</div><div className="mt-6 rounded-xl bg-[#aaa6ef]/[0.07] p-3.5"><div className="mb-2 flex items-center gap-2 text-[#c3bfff]"><Sparkles size={14} /><span className="text-[11px] font-medium">FlowOS recommendation</span></div><p className="text-[11px] leading-5 text-white/48">Assign an Okta owner before approving the pilot packet. This is the only unresolved critical-path item.</p><button onClick={() => toast.info("Recommendation added to the decision packet.")} className="mt-3 text-[10px] font-medium text-[#c3bfff] hover:text-white">Add to decision packet →</button></div></CardContent></Card>
            </section>

            <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]"><Card className="border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Dependency critical path</CardTitle><p className="mt-1 text-[11px] text-white/38">Why the handoff is or is not moving</p></div><button onClick={() => setActive("Dependencies")} className="flex items-center gap-1 text-[11px] text-[#aaa6ef] hover:text-white">Open graph <ArrowUpRight size={13} /></button></CardHeader><CardContent className="p-5"><div className="relative flex flex-col gap-3 md:flex-row md:items-start md:gap-0">{data.dependencies.map((dep, index) => <div key={dep.id} className="relative flex flex-1 items-center gap-3 md:block md:pr-4"><div className="flex items-center gap-3 md:block"><div className={cn("relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border", dep.state === "complete" ? "border-[#96d3aa]/40 bg-[#96d3aa]/10 text-[#96d3aa]" : dep.state === "blocked" ? "border-[#ef8b8b]/40 bg-[#ef8b8b]/10 text-[#ef8b8b]" : "border-white/10 bg-white/[0.04] text-white/35")} >{dep.state === "complete" ? <Check size={15} /> : dep.state === "blocked" ? <AlertCircle size={15} /> : <CircleDot size={14} />}</div><div className="md:mt-3"><p className="text-[11px] font-medium text-white/75">{dep.label}</p><p className={cn("mt-1 text-[9px]", dep.state === "blocked" ? "text-[#ef8b8b]" : "text-white/35")}>{dep.eta}</p></div></div>{index < data.dependencies.length - 1 && <div className="hidden h-px flex-1 bg-white/10 md:absolute md:left-8 md:right-0 md:top-4 md:block" />}</div>)}</div><div className="mt-5 grid gap-3 border-t border-white/[0.06] pt-4 sm:grid-cols-2"><div className="flex items-center gap-2 text-[10px] text-white/43"><Target size={13} className="text-[#aaa6ef]" /> Critical path: <span className="text-white/70">Okta approval → connector test → security review</span></div><div className="flex items-center gap-2 text-[10px] text-white/43"><Users size={13} className="text-[#e49a69]" /> Current owner: <span className="text-[#f2c19a]">Unassigned</span></div></div></CardContent></Card><Card className="border-white/[0.06] bg-[#13141d] shadow-[0_14px_40px_rgba(0,0,0,0.14)]"><CardHeader className="flex flex-row items-center justify-between border-b border-white/[0.06] px-5 py-4"><div><CardTitle className="font-display text-[16px] font-medium tracking-[-0.02em] text-white">Agent activity</CardTitle><p className="mt-1 text-[11px] text-white/38">Auditable events from this workspace</p></div><button onClick={() => setActive("Agent activity")} className="text-white/35 hover:text-white"><MoreHorizontal size={16} /></button></CardHeader><CardContent className="space-y-4 p-5">{data.activity.map((event) => <div key={`${event.time}-${event.actor}`} className="flex gap-3"><div className={cn("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", event.tone === "critical" ? "bg-[#ef8b8b]" : event.tone === "good" ? "bg-[#96d3aa]" : event.tone === "warn" ? "bg-[#e49a69]" : "bg-[#aaa6ef]")} /><div className="min-w-0"><p className="text-[11px] leading-5 text-white/65"><span className="font-medium text-white/85">{event.actor}</span> {event.action}</p><p className="mt-0.5 text-[9px] text-white/25">{event.time}</p></div></div>)}<button onClick={() => setActive("Agent activity")} className="flex w-full items-center justify-center gap-1.5 border-t border-white/[0.06] pt-3 text-[11px] text-white/40 hover:text-white">View audit trail <ArrowUpRight size={13} /></button></CardContent></Card></section>

            <footer className="mt-8 flex flex-col justify-between gap-3 border-t border-white/[0.06] py-5 text-[10px] text-white/25 sm:flex-row sm:items-center"><div className="flex items-center gap-2"><span className="flex h-5 w-5 items-center justify-center rounded bg-[#aaa6ef]/15 text-[#aaa6ef]"><ShieldCheck size={12} /></span> Governed by FlowOS · Shadow mode · No autonomous external actions</div><div className="flex items-center gap-4"><button onClick={() => toast.info("Runbook link copied.")} className="hover:text-white/60">Runbook</button><button onClick={() => toast.info("Architecture docs link copied.")} className="hover:text-white/60">Architecture</button><span>v0.1.0-alpha</span></div></footer>
          </div>}
        </main>
      </div>

      {showCommand && <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/55 px-4 pt-[16vh] backdrop-blur-sm" onClick={() => setShowCommand(false)}><div className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#171821] shadow-2xl" onClick={(event) => event.stopPropagation()}><div className="flex items-center gap-3 border-b border-white/[0.07] px-4 py-4"><Command size={16} className="text-[#aaa6ef]" /><input autoFocus placeholder="Search cases, owners, evidence…" className="flex-1 bg-transparent text-sm text-white outline-none placeholder:text-white/25" /><button onClick={() => setShowCommand(false)} className="text-white/30 hover:text-white"><X size={16} /></button></div><div className="p-2"><button onClick={() => { setShowCommand(false); setSelectedId("case-001"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs text-white/65 hover:bg-white/[0.06]"><Search size={14} className="text-white/35" /> Jump to UniStack partner onboarding <kbd className="ml-auto text-[9px] text-white/25">↵</kbd></button><button onClick={() => { setShowCommand(false); setActive("Approval inbox"); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs text-white/65 hover:bg-white/[0.06]"><Inbox size={14} className="text-white/35" /> Open approval inbox</button><button onClick={() => { setShowCommand(false); simulate.mutate(); }} className="flex w-full items-center gap-3 rounded-lg px-3 py-3 text-left text-xs text-white/65 hover:bg-white/[0.06]"><Play size={14} className="text-white/35" /> Simulate safe connector retry</button></div></div></div>}
    </div>
  );
}
