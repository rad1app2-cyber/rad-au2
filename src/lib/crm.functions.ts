import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const DEAL_STAGES = ["new", "contacted", "proposal", "won", "lost"] as const;
export type DealStage = (typeof DEAL_STAGES)[number];

const contactInput = z.object({
  full_name: z.string().min(1),
  phone: z.string().optional().default(""),
  email: z.string().optional().default(""),
  company: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  source: z.string().optional().default("whatsapp"),
  agent_id: z.string().uuid().nullable().optional(),
});

const dealInput = z.object({
  title: z.string().min(1),
  value: z.coerce.number().min(0).optional().default(0),
  currency: z.string().optional().default("SAR"),
  stage: z.enum(DEAL_STAGES).optional().default("new"),
  expected_close_date: z.string().optional().default(""),
  notes: z.string().optional().default(""),
  contact_id: z.string().uuid().nullable().optional(),
  agent_id: z.string().uuid().nullable().optional(),
});

/* ---------------- CRM: contacts ---------------- */

export const listContacts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("contacts")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => contactInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("contacts")
      .insert({ ...data, agent_id: data.agent_id || null, user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    contactInput.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, string | null> = {};
    if (data.full_name !== undefined) patch["full_name"] = data.full_name;
    if (data.phone !== undefined) patch["phone"] = data.phone;
    if (data.email !== undefined) patch["email"] = data.email;
    if (data.company !== undefined) patch["company"] = data.company;
    if (data.notes !== undefined) patch["notes"] = data.notes;
    if (data.source !== undefined) patch["source"] = data.source;
    if (data.agent_id !== undefined) patch["agent_id"] = data.agent_id || null;
    const { error } = await context.supabase
      .from("contacts")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });


export const deleteContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("contacts").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Sales: deals ---------------- */

export const listDeals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const [{ data: deals, error }, { data: contacts }] = await Promise.all([
      context.supabase.from("deals").select("*").order("created_at", { ascending: false }),
      context.supabase.from("contacts").select("id, full_name, company"),
    ]);
    if (error) throw new Error(error.message);
    return { deals: deals ?? [], contacts: contacts ?? [] };
  });

export const createDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dealInput.parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("deals")
      .insert({
        ...data,
        contact_id: data.contact_id || null,
        agent_id: data.agent_id || null,
        expected_close_date: data.expected_close_date || null,
        user_id: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    dealInput.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: Record<string, string | number | null> = {};
    if (data.title !== undefined) patch["title"] = data.title;
    if (data.value !== undefined) patch["value"] = data.value;
    if (data.currency !== undefined) patch["currency"] = data.currency;
    if (data.stage !== undefined) patch["stage"] = data.stage;
    if (data.notes !== undefined) patch["notes"] = data.notes;
    if (data.expected_close_date !== undefined)
      patch["expected_close_date"] = data.expected_close_date || null;
    if (data.contact_id !== undefined) patch["contact_id"] = data.contact_id || null;
    if (data.agent_id !== undefined) patch["agent_id"] = data.agent_id || null;
    const { error } = await context.supabase
      .from("deals")
      .update(patch as never)
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDeal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("deals").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* ---------------- Analytics ---------------- */

export const getAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const since = new Date(Date.now() - 13 * 86400000);
    since.setHours(0, 0, 0, 0);

    const [agentsRes, contactsRes, dealsRes, messagesRes] = await Promise.all([
      context.supabase.from("agents").select("id, ai_name, status, active"),
      context.supabase.from("contacts").select("id, agent_id, created_at"),
      context.supabase.from("deals").select("id, agent_id, stage, value, created_at"),
      context.supabase
        .from("messages")
        .select("id, role, created_at, remote_jid, agent_id")
        .gte("created_at", since.toISOString()),
    ]);

    if (agentsRes.error || contactsRes.error || dealsRes.error || messagesRes.error) throw new Error("تعذّر تحميل الإحصاءات");
    const agents = agentsRes.data ?? [];
    const contacts = contactsRes.data ?? [];
    const deals = dealsRes.data ?? [];
    const messages = messagesRes.data ?? [];

    const days: { day: string; messages: number; contacts: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const key = d.toISOString().slice(0, 10);
      days.push({
        day: key.slice(5),
        messages: messages.filter((m) => m.created_at.slice(0, 10) === key).length,
        contacts: contacts.filter((c) => c.created_at.slice(0, 10) === key).length,
      });
    }

    const stages = DEAL_STAGES.map((stage) => ({
      stage,
      count: deals.filter((d) => d.stage === stage).length,
      value: deals
        .filter((d) => d.stage === stage)
        .reduce((sum, d) => sum + Number(d.value ?? 0), 0),
    }));

    const won = deals.filter((d) => d.stage === "won");
    const closed = deals.filter((d) => d.stage === "won" || d.stage === "lost");

    return {
      totals: {
        agents: agents.length,
        connectedAgents: agents.filter((a) => a.status === "open").length,
        contacts: contacts.length,
        deals: deals.length,
        openValue: deals
          .filter((d) => !["won", "lost"].includes(d.stage))
          .reduce((s, d) => s + Number(d.value ?? 0), 0),
        wonValue: won.reduce((s, d) => s + Number(d.value ?? 0), 0),
        winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
        messages14d: messages.length,
        conversations14d: new Set(messages.map((m) => `${m.agent_id}:${m.remote_jid}`)).size,
      },
      days,
      stages,
      byAgent: agents.map((a) => ({
        id: a.id,
        name: a.ai_name,
        messages: messages.filter((m) => m.agent_id === a.id).length,
        conversations: new Set(messages.filter((m) => m.agent_id === a.id).map((m) => m.remote_jid)).size,
        contacts: contacts.filter((c) => c.agent_id === a.id).length,
        deals: deals.filter((d) => d.agent_id === a.id).length,
      })),
    };
  });

/* ---------------- Per-agent insights (CRM + sales + analytics for one assistant) ---------------- */

export const getAgentInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const since = new Date(Date.now() - 13 * 86400000);
    since.setHours(0, 0, 0, 0);

    const [contactsRes, dealsRes, messagesRes] = await Promise.all([
      context.supabase
        .from("contacts")
        .select("*")
        .eq("agent_id", data.agent_id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("deals")
        .select("*")
        .eq("agent_id", data.agent_id)
        .order("created_at", { ascending: false }),
      context.supabase
        .from("messages")
        .select("id, role, created_at, remote_jid")
        .eq("agent_id", data.agent_id)
        .gte("created_at", since.toISOString()),
    ]);

    const contacts = contactsRes.data ?? [];
    const deals = dealsRes.data ?? [];
    const messages = messagesRes.data ?? [];

    const days: { day: string; messages: number; contacts: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const key = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
      days.push({
        day: key.slice(5),
        messages: messages.filter((m) => m.created_at.slice(0, 10) === key).length,
        contacts: contacts.filter((c) => c.created_at.slice(0, 10) === key).length,
      });
    }

    const stages = DEAL_STAGES.map((stage) => ({
      stage,
      count: deals.filter((d) => d.stage === stage).length,
      value: deals
        .filter((d) => d.stage === stage)
        .reduce((sum, d) => sum + Number(d.value ?? 0), 0),
    }));

    const won = deals.filter((d) => d.stage === "won");
    const closed = deals.filter((d) => d.stage === "won" || d.stage === "lost");

    return {
      contacts,
      deals,
      days,
      stages,
      totals: {
        contacts: contacts.length,
        deals: deals.length,
        messages14d: messages.length,
        conversations14d: new Set(messages.map((m) => m.remote_jid)).size,
        openValue: deals
          .filter((d) => !["won", "lost"].includes(d.stage))
          .reduce((s, d) => s + Number(d.value ?? 0), 0),
        wonValue: won.reduce((s, d) => s + Number(d.value ?? 0), 0),
        winRate: closed.length ? Math.round((won.length / closed.length) * 100) : 0,
      },
    };
  });
