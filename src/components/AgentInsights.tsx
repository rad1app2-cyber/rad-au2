import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  getAgentInsights,
  createContact,
  deleteContact,
  createDeal,
  updateDeal,
  deleteDeal,
  DEAL_STAGES,
  type DealStage,
} from "@/lib/crm.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Plus, Trash2, Users, TrendingUp } from "lucide-react";

const STAGE_LABELS: Record<DealStage, string> = {
  new: "جديدة",
  contacted: "تم التواصل",
  proposal: "عرض سعر",
  won: "مكسوبة",
  lost: "خسارة",
};

const money = (n: number) => `${Number(n).toLocaleString("ar-SA")} ر.س`;

function useInsights(agentId: string) {
  const fetchInsights = useServerFn(getAgentInsights);
  return useQuery({
    queryKey: ["agent-insights", agentId],
    queryFn: () => fetchInsights({ data: { agent_id: agentId } }),
  });
}

function useRefresh(agentId: string) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ["agent-insights", agentId] });
    qc.invalidateQueries({ queryKey: ["contacts"] });
    qc.invalidateQueries({ queryKey: ["deals"] });
    qc.invalidateQueries({ queryKey: ["analytics"] });
  };
}

function Empty({ icon: Icon, title, hint }: { icon: typeof Users; title: string; hint: string }) {
  return (
    <div className="glow-card rounded-3xl border border-dashed border-border bg-card/50 p-10 text-center">
      <Icon className="mx-auto h-10 w-10 text-primary" />
      <p className="mt-4 text-lg font-bold">{title}</p>
      <p className="mt-1 text-muted-foreground">{hint}</p>
    </div>
  );
}

export function AgentCrmTab({ agentId }: { agentId: string }) {
  const { data, isLoading } = useInsights(agentId);
  const refresh = useRefresh(agentId);
  const create = useServerFn(createContact);
  const remove = useServerFn(deleteContact);
  const [form, setForm] = useState({ full_name: "", phone: "", company: "" });

  const addMutation = useMutation({
    mutationFn: () =>
      create({ data: { ...form, source: "whatsapp", agent_id: agentId } }),
    onSuccess: () => {
      setForm({ full_name: "", phone: "", company: "" });
      toast.success("تمت إضافة العميل");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف العميل");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-4">
      <form
        className="glow-card grid gap-3 rounded-3xl border border-border bg-card p-5 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.full_name.trim()) return;
          addMutation.mutate();
        }}
      >
        <Input
          required
          placeholder="اسم العميل"
          value={form.full_name}
          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
        />
        <Input
          dir="ltr"
          placeholder="9665xxxxxxxx"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />
        <Input
          placeholder="الشركة"
          value={form.company}
          onChange={(e) => setForm({ ...form, company: e.target.value })}
        />
        <Button
          type="submit"
          disabled={addMutation.isPending}
          className="brand-gradient font-bold text-primary-foreground"
        >
          <Plus className="ml-2 h-4 w-4" /> {addMutation.isPending ? "جارٍ إضافة العميل…" : "إضافة عميل"}
        </Button>
      </form>

      {isLoading ? (
        <p className="text-muted-foreground">جارٍ التحميل…</p>
      ) : (data?.contacts.length ?? 0) === 0 ? (
        <Empty
          icon={Users}
          title="لا يوجد عملاء مرتبطون بهذا المساعد"
          hint="أضف عميلاً من الأعلى ليظهر هنا وفي سجل العملاء العام."
        />
      ) : (
        <div className="glow-card overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الاسم</TableHead>
                <TableHead className="text-right">الجوال</TableHead>
                <TableHead className="text-right">الشركة</TableHead>
                <TableHead className="text-right">المصدر</TableHead>
                <TableHead className="text-right">حذف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.contacts.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-bold">{c.full_name}</TableCell>
                  <TableCell dir="ltr" className="text-right">{c.phone || "—"}</TableCell>
                  <TableCell>{c.company || "—"}</TableCell>
                  <TableCell>{c.source}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="حذف"
                      onClick={() => delMutation.mutate(c.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function AgentSalesTab({ agentId }: { agentId: string }) {
  const { data, isLoading } = useInsights(agentId);
  const refresh = useRefresh(agentId);
  const create = useServerFn(createDeal);
  const update = useServerFn(updateDeal);
  const remove = useServerFn(deleteDeal);
  const [form, setForm] = useState({ title: "", value: "", contact_id: "" });

  const addMutation = useMutation({
    mutationFn: () =>
      create({
        data: {
          title: form.title,
          value: Number(form.value || 0),
          contact_id: form.contact_id || null,
          agent_id: agentId,
        },
      }),
    onSuccess: () => {
      setForm({ title: "", value: "", contact_id: "" });
      toast.success("تمت إضافة الصفقة");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const stageMutation = useMutation({
    mutationFn: (v: { id: string; stage: DealStage }) => update({ data: v }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const delMutation = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => {
      toast.success("تم حذف الصفقة");
      refresh();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const t = data?.totals;

  return (
    <div className="space-y-4">
      {t && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">صفقات مفتوحة</p>
              <p className="mt-1 text-2xl font-extrabold">{money(t.openValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">صفقات مكسوبة</p>
              <p className="mt-1 text-2xl font-extrabold">{money(t.wonValue)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">نسبة النجاح</p>
              <p className="mt-1 text-2xl font-extrabold">{t.winRate}%</p>
            </CardContent>
          </Card>
        </div>
      )}

      <form
        className="glow-card grid gap-3 rounded-3xl border border-border bg-card p-5 sm:grid-cols-4"
        onSubmit={(e) => {
          e.preventDefault();
          if (!form.title.trim()) return;
          addMutation.mutate();
        }}
      >
        <Input
          required
          placeholder="عنوان الصفقة"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Input
          type="number"
          min={0}
          placeholder="القيمة (ر.س)"
          value={form.value}
          onChange={(e) => setForm({ ...form, value: e.target.value })}
        />
        <Select
          value={form.contact_id || "none"}
          onValueChange={(v) => setForm({ ...form, contact_id: v === "none" ? "" : v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="العميل" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">بدون عميل</SelectItem>
            {(data?.contacts ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="submit"
          disabled={addMutation.isPending}
          className="brand-gradient font-bold text-primary-foreground"
        >
          <Plus className="ml-2 h-4 w-4" /> {addMutation.isPending ? "جارٍ إضافة الصفقة…" : "إضافة صفقة"}
        </Button>
      </form>

      {isLoading ? (
        <p className="text-muted-foreground">جارٍ التحميل…</p>
      ) : (data?.deals.length ?? 0) === 0 ? (
        <Empty
          icon={TrendingUp}
          title="لا توجد صفقات لهذا المساعد"
          hint="أضف صفقة لتتابع قيمتها ومرحلتها حتى الإغلاق."
        />
      ) : (
        <div className="glow-card overflow-x-auto rounded-2xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">الصفقة</TableHead>
                <TableHead className="text-right">القيمة</TableHead>
                <TableHead className="text-right">المرحلة</TableHead>
                <TableHead className="text-right">حذف</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.deals.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="font-bold">{d.title}</TableCell>
                  <TableCell>{money(Number(d.value ?? 0))}</TableCell>
                  <TableCell className="min-w-40">
                    <Select
                      value={d.stage}
                      onValueChange={(v) => stageMutation.mutate({ id: d.id, stage: v as DealStage })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DEAL_STAGES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {STAGE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="حذف"
                      onClick={() => delMutation.mutate(d.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

export function AgentAnalyticsTab({ agentId }: { agentId: string }) {
  const { data, isLoading } = useInsights(agentId);
  const t = data?.totals;
  const stageData = (data?.stages ?? []).map((s) => ({
    ...s,
    label: STAGE_LABELS[s.stage as DealStage] ?? s.stage,
  }));

  if (isLoading || !t) return <p className="text-muted-foreground">جارٍ تحميل البيانات…</p>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">الرسائل (14 يومًا)</p>
            <p className="mt-1 text-2xl font-extrabold">{t.messages14d}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">المحادثات (14 يومًا)</p>
            <p className="mt-1 text-2xl font-extrabold">{t.conversations14d}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">العملاء</p>
            <p className="mt-1 text-2xl font-extrabold">{t.contacts}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-muted-foreground">الصفقات</p>
            <p className="mt-1 text-2xl font-extrabold">{t.deals}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">النشاط اليومي</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.days}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="day" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Line
                type="monotone"
                dataKey="messages"
                name="الرسائل"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="contacts"
                name="العملاء الجدد"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">مراحل الصفقات</CardTitle>
        </CardHeader>
        <CardContent className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stageData}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2} />
              <XAxis dataKey="label" fontSize={12} />
              <YAxis allowDecimals={false} fontSize={12} />
              <Tooltip />
              <Bar dataKey="count" name="عدد الصفقات" fill="hsl(var(--primary))" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
