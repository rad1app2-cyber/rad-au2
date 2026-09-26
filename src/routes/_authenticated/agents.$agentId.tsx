import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getAgent, agentStatus } from "@/lib/radd.functions";
import { getAgentInsights } from "@/lib/crm.functions";
import { AgentAnalyticsTab } from "@/components/AgentInsights";
import { Button } from "@/components/ui/button";
import { ArrowRight, MessageCircle, Phone, FileText, Users, BriefcaseBusiness } from "lucide-react";

export const Route = createFileRoute("/_authenticated/agents/$agentId")({
  head: () => ({ meta: [
    { title: "تفاصيل المساعد | ردّ" },
    { name: "description", content: "تابع حالة مساعد واتساب وإحصاءات الرسائل والمحادثات والعملاء." },
    { property: "og:title", content: "تفاصيل مساعد واتساب | ردّ" },
    { property: "og:description", content: "حالة المساعد وإحصاءات أدائه عبر واتساب." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: AgentPage,
});

function AgentPage() {
  const { agentId } = Route.useParams();
  const fetchAgent = useServerFn(getAgent);
  const fetchStatus = useServerFn(agentStatus);
  const fetchInsights = useServerFn(getAgentInsights);
  const { data, isLoading, isError } = useQuery({ queryKey: ["agent", agentId], queryFn: () => fetchAgent({ data: { id: agentId } }) });
  const { data: live } = useQuery({ queryKey: ["agent-status", agentId], queryFn: () => fetchStatus({ data: { id: agentId } }), refetchInterval: 30000 });
  const { data: insights } = useQuery({ queryKey: ["agent-insights", agentId], queryFn: () => fetchInsights({ data: { agent_id: agentId } }) });
  if (isLoading) return <p className="p-10 text-muted-foreground">جارٍ التحميل…</p>;
  if (isError || !data) return <p role="alert" className="p-10 text-destructive">تعذّر عرض المساعد.</p>;
  const a = data.agent;
  const connected = (live?.status ?? a.status) === "open";
  return <main className="mx-auto max-w-5xl space-y-8 px-4 py-8" dir="rtl">
    <div className="flex flex-wrap items-center justify-between gap-3"><Button asChild variant="ghost"><Link to="/dashboard"><ArrowRight className="h-4 w-4" /> لوحة التحكم</Link></Button><Button asChild className="brand-gradient text-primary-foreground"><Link to="/"><MessageCircle className="h-4 w-4" /> تحدث مع ردّ</Link></Button></div>
    <header className="border-b border-border pb-7"><div className="flex flex-wrap items-center gap-4"><h1 className="text-3xl font-extrabold">{a.ai_name}</h1><span className={connected ? "text-primary" : "text-muted-foreground"}>● {connected ? "متصل بواتساب" : "غير متصل"}</span></div><p className="mt-3 flex items-center gap-2 text-muted-foreground"><Phone className="h-4 w-4" /><span dir="ltr">{a.whatsapp_number}</span></p></header>
    <section aria-label="معلومات المساعد" className="grid gap-x-8 gap-y-5 border-b border-border pb-8 sm:grid-cols-2">
      <div><h2 className="text-sm text-muted-foreground">المهمة</h2><p className="mt-1 whitespace-pre-wrap">{a.job || "—"}</p></div>
      <div><h2 className="text-sm text-muted-foreground">الشخصية</h2><p className="mt-1 whitespace-pre-wrap">{a.persona || "—"}</p></div>
      <div><h2 className="text-sm text-muted-foreground">رسالة الترحيب</h2><p className="mt-1 whitespace-pre-wrap">{a.greeting || "—"}</p></div>
      <div><h2 className="text-sm text-muted-foreground">رقم الموظف</h2><p className="mt-1" dir="ltr">{a.employee_number || "—"}</p></div>
    </section>
    <section className="grid gap-4 sm:grid-cols-3"><div className="flex items-center gap-3"><FileText className="text-primary" /><div><strong className="block text-xl">{data.files.length}</strong><span className="text-sm text-muted-foreground">ملفات المعرفة</span></div></div><div className="flex items-center gap-3"><Users className="text-primary" /><div><strong className="block text-xl">{insights?.totals.contacts ?? 0}</strong><span className="text-sm text-muted-foreground">العملاء</span></div></div><div className="flex items-center gap-3"><BriefcaseBusiness className="text-primary" /><div><strong className="block text-xl">{insights?.totals.deals ?? 0}</strong><span className="text-sm text-muted-foreground">الصفقات</span></div></div></section>
    <section><h2 className="mb-5 text-xl font-bold">الأداء</h2><AgentAnalyticsTab agentId={agentId} /></section>
  </main>;
}
