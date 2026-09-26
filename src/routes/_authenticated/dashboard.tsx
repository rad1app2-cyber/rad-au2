import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { listAgents } from "@/lib/radd.functions";
import { getAnalytics } from "@/lib/crm.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Bot, LogOut, MessageCircle, MessagesSquare, Phone, Users, BriefcaseBusiness } from "lucide-react";
import logo from "@/assets/radd-logo.png";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [
    { title: "لوحة مساعديك | ردّ" },
    { name: "description", content: "تابع اتصال مساعديك بواتساب ورسائلهم ومحادثاتهم وعملاءهم." },
    { property: "og:title", content: "لوحة مساعديك | ردّ" },
    { property: "og:description", content: "إحصاءات مساعديك المتصلين بواتساب ونشاطهم." },
    { property: "og:type", content: "website" },
    { name: "twitter:card", content: "summary_large_image" },
  ] }),
  component: Dashboard,
});

function Dashboard() {
  const navigate = useNavigate();
  const fetchAgents = useServerFn(listAgents);
  const fetchAnalytics = useServerFn(getAnalytics);
  const agentsQuery = useQuery({ queryKey: ["agents"], queryFn: () => fetchAgents() });
  const analyticsQuery = useQuery({ queryKey: ["analytics"], queryFn: () => fetchAnalytics() });
  const agents = agentsQuery.data ?? [];
  const totals = analyticsQuery.data?.totals;
  const stats = analyticsQuery.data?.byAgent ?? [];
  const metrics = [
    { label: "المساعدون المتصلون", value: totals?.connectedAgents ?? 0, icon: Bot },
    { label: "الرسائل · آخر 14 يومًا", value: totals?.messages14d ?? 0, icon: MessageCircle },
    { label: "المحادثات · آخر 14 يومًا", value: totals?.conversations14d ?? 0, icon: MessagesSquare },
    { label: "العملاء", value: totals?.contacts ?? 0, icon: Users },
  ];
  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="border-b border-border bg-card/50">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-2"><img src={logo} alt="ردّ" className="h-9 w-9" /><span className="brand-text text-2xl font-extrabold">ردّ</span></Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm"><Link to="/"><MessageCircle className="h-4 w-4" /> <span>المحادثة</span></Link></Button>
            <Button variant="ghost" size="icon" aria-label="خروج" onClick={async () => { await supabase.auth.signOut(); navigate({ to: "/auth" }); }}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl space-y-8 px-4 py-8 md:py-12">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div><h1 className="text-3xl font-extrabold">مساعدوك</h1><p className="mt-2 text-muted-foreground">نشاط مساعديك المرتبطين بواتساب</p></div>
          <Button asChild className="brand-gradient text-primary-foreground"><Link to="/">تحدث مع ردّ <ArrowLeft className="h-4 w-4" /></Link></Button>
        </div>
        {(agentsQuery.isLoading || analyticsQuery.isLoading) ? <p className="text-muted-foreground">جارٍ تحميل البيانات…</p> : (agentsQuery.isError || analyticsQuery.isError) ? <p role="alert" className="text-destructive">تعذّر تحميل الإحصاءات. حاول تحديث الصفحة.</p> : <>
          <section aria-label="ملخص النشاط" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {metrics.map(({ label, value, icon: Icon }) => <div key={label} className="border-t border-border bg-card px-4 py-5 sm:px-6"><Icon className="mb-5 h-5 w-5 text-primary" /><p className="text-3xl font-extrabold tabular-nums">{value.toLocaleString("ar")}</p><p className="mt-1 text-sm text-muted-foreground">{label}</p></div>)}
          </section>
          <section aria-label="المساعدون" className="space-y-4">
            <h2 className="text-xl font-bold">المساعدون ({agents.length})</h2>
            {agents.length === 0 ? <div className="border-y border-border py-12 text-center"><Bot className="mx-auto h-9 w-9 text-primary" /><p className="mt-4 font-bold">لا يوجد مساعد بعد</p><Button asChild variant="link"><Link to="/">ابدأ المحادثة مع ردّ</Link></Button></div> :
              <div className="grid gap-3 md:grid-cols-2">{agents.map((agent) => {
                const s = stats.find((row) => row.id === agent.id);
                return <Link key={agent.id} to="/agents/$agentId" params={{ agentId: agent.id }} className="group block rounded-md border border-border bg-card p-5 transition-colors hover:border-primary/60 focus-visible:outline-2 focus-visible:outline-primary">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-xl font-bold">{agent.ai_name}</h3><span className={agent.status === "open" ? "text-sm font-bold text-primary" : "text-sm text-muted-foreground"}>● {agent.status === "open" ? "متصل" : "غير متصل"}</span></div>
                  <p className="mt-2 flex items-center gap-2 text-sm text-muted-foreground"><Phone className="h-4 w-4" /><span dir="ltr">{agent.whatsapp_number}</span></p>
                  {agent.job && <p className="mt-3 line-clamp-2 text-sm">{agent.job}</p>}
                  <div className="mt-5 grid grid-cols-4 gap-2 border-t border-border pt-4 text-center text-xs"><div><strong className="block text-lg">{s?.messages ?? 0}</strong>رسالة</div><div><strong className="block text-lg">{s?.conversations ?? 0}</strong>محادثة</div><div><strong className="block text-lg">{s?.contacts ?? 0}</strong>عميل</div><div><strong className="block text-lg">{s?.deals ?? 0}</strong>صفقة</div></div>
                  <span className="mt-4 flex items-center gap-1 text-sm font-bold text-primary">عرض التفاصيل <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-1" /></span>
                </Link>;
              })}</div>}
          </section>
          {totals && totals.deals > 0 && <p className="flex items-center gap-2 border-t border-border pt-5 text-sm text-muted-foreground"><BriefcaseBusiness className="h-4 w-4" /> إجمالي الصفقات: {totals.deals.toLocaleString("ar")}</p>}
        </>}
      </main>
    </div>
  );
}
