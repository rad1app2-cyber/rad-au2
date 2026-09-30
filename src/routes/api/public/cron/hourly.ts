import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Runs every hour: viewing reminders, customer follow-ups, and the daily summary for the employee.
async function run() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const evo = await import("@/lib/evolution.server");
  const now = new Date();
  const in24h = new Date(now.getTime() + 24 * 3600e3).toISOString();
  const stats = { reminders: 0, followUps: 0, digests: 0 };

  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id, ai_name, instance_name, employee_number, status, active, last_digest_on")
    .eq("active", true)
    .eq("status", "open");

  for (const a of agents ?? []) {
    const send = async (to: string, text: string) => {
      try {
        await evo.sendText(a.instance_name, to, text);
      } catch (e) {
        console.error("cron send failed", a.id, e);
      }
    };
    const fmt = (d: string) =>
      new Date(d).toLocaleString("ar", { timeZone: "Asia/Riyadh", dateStyle: "medium", timeStyle: "short" });

    // 1) Reminders for viewings in the next 24 hours.
    const { data: appts } = await supabaseAdmin
      .from("appointments")
      .select("*")
      .eq("agent_id", a.id)
      .eq("reminded", false)
      .neq("status", "cancelled")
      .gte("scheduled_at", now.toISOString())
      .lte("scheduled_at", in24h);
    for (const ap of appts ?? []) {
      await send(ap.customer_phone, `تذكير من ${a.ai_name}: لديك موعد معاينة ${ap.property_ref ? `لـ«${ap.property_ref}» ` : ""}بتاريخ ${fmt(ap.scheduled_at)}. نراك قريبًا!`);
      if (a.employee_number)
        await send(a.employee_number, `📅 تذكير موعد: ${ap.customer_name || "عميل"} (+${ap.customer_phone}) — ${ap.property_ref} — ${fmt(ap.scheduled_at)}`);
      await supabaseAdmin.from("appointments").update({ reminded: true }).eq("id", ap.id);
      stats.reminders++;
    }

    // 2) Follow-ups that are due.
    const { data: due } = await supabaseAdmin
      .from("contacts")
      .select("id, full_name, phone, request_summary")
      .eq("agent_id", a.id)
      .not("follow_up_at", "is", null)
      .lte("follow_up_at", now.toISOString())
      .neq("lead_status", "closed");
    for (const c of due ?? []) {
      await send(c.phone, `مرحبًا${c.full_name ? ` ${c.full_name}` : ""}، معك ${a.ai_name}. أردت الاطمئنان إن كنت ما زلت تبحث عن طلبك، وهل تحب أن أرسل لك عروضًا جديدة؟`);
      await supabaseAdmin.from("contacts").update({ follow_up_at: null }).eq("id", c.id);
      stats.followUps++;
    }

    // 3) Daily summary to the employee (once a day, from 6am Riyadh time).
    const riyadh = new Date(now.getTime() + 3 * 3600e3);
    const today = riyadh.toISOString().slice(0, 10);
    if (a.employee_number && riyadh.getUTCHours() >= 6 && a.last_digest_on !== today) {
      const dayEnd = new Date(`${today}T21:00:00.000Z`).toISOString(); // midnight Riyadh
      const [{ data: todays }, { data: hot }] = await Promise.all([
        supabaseAdmin.from("appointments").select("*").eq("agent_id", a.id).gte("scheduled_at", now.toISOString()).lte("scheduled_at", dayEnd).order("scheduled_at"),
        supabaseAdmin.from("contacts").select("full_name, phone, request_summary").eq("agent_id", a.id).eq("lead_status", "hot").limit(10),
      ]);
      const lines = [
        `☀️ ملخص اليوم من ${a.ai_name}`,
        `مواعيد اليوم: ${todays?.length ?? 0}`,
        ...(todays ?? []).map((t) => `• ${fmt(t.scheduled_at)} — ${t.customer_name || "+" + t.customer_phone} — ${t.property_ref}`),
        hot?.length ? `\nعملاء مهتمون جدًا:` : "",
        ...(hot ?? []).map((h) => `• ${h.full_name || "+" + h.phone}: ${h.request_summary.slice(0, 120)}`),
      ].filter(Boolean);
      await send(a.employee_number, lines.join("\n"));
      await supabaseAdmin.from("agents").update({ last_digest_on: today }).eq("id", a.id);
      stats.digests++;
    }
  }
  return stats;
}

export const Route = createFileRoute("/api/public/cron/hourly")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        return Response.json(await run());
      },
    },
  },
});
