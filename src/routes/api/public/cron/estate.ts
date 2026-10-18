import { createFileRoute } from "@tanstack/react-router";
import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

// Runs hourly alongside the reminders cron, but the estate sync itself is leased to run
// at most once every 2 hours per agent: pulls new listings from the connected property
// platform, markets matching ones to opted-in customers (48h software limit), and
// finalizes the previous month's Excel archive on the first day of each month.
async function run() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const estate = await import("@/lib/estate.server");
  const stats = { synced: 0, added: 0, changed: 0, marketed: 0, archives: 0, skipped: 0 };

  const { data: agents } = await supabaseAdmin
    .from("agents")
    .select("id")
    .eq("active", true)
    .eq("status", "open");

  for (const a of agents ?? []) {
    // Software lease: only one run per agent per 2 hours.
    const { data: leased } = await supabaseAdmin.rpc("estate_acquire_lease", { p_agent: a.id });
    if (!leased) {
      stats.skipped++;
      continue;
    }
    try {
      const s = await estate.syncEstate(a.id);
      stats.synced += s.synced;
      stats.added += s.added;
      stats.changed += s.changed;
      if (s.added > 0) {
        const m = await estate.marketNewProperties(a.id);
        stats.marketed += m.sent;
      }
      // On the 1st of each month, finalize last month's archive.
      const now = new Date();
      if (now.getUTCDate() === 1) {
        const prev = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
        const month = prev.toISOString().slice(0, 7);
        const { data: existing } = await supabaseAdmin
          .from("estate_archives")
          .select("month")
          .eq("agent_id", a.id)
          .eq("month", month)
          .maybeSingle();
        if (!existing) {
          await estate.buildMonthlyArchive(a.id, month);
          stats.archives++;
        }
      }
      await supabaseAdmin.from("estate_jobs").update({ last_error: null }).eq("agent_id", a.id);
    } catch (e) {
      await supabaseAdmin
        .from("estate_jobs")
        .update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "estate run failed" })
        .eq("agent_id", a.id);
    }
  }
  return stats;
}

export const Route = createFileRoute("/api/public/cron/estate")({
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
