import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Owner downloads the monthly Excel archive + conversion/demand-gap report for one of their assistants. */
export const downloadMonthlyReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agentId: string; month: string }) => {
    if (!/^[0-9a-f-]{36}$/i.test(d.agentId)) throw new Error("invalid agent");
    if (!/^\d{4}-\d{2}$/.test(d.month)) throw new Error("invalid month");
    return d;
  })
  .handler(async ({ data, context }) => {
    // RLS confirms the caller owns this assistant before any privileged work.
    const { data: agent } = await context.supabase.from("agents").select("id").eq("id", data.agentId).maybeSingle();
    if (!agent) throw new Error("not found");
    const estate = await import("./estate.server");
    const [archive, report] = await Promise.all([
      estate.buildMonthlyArchive(data.agentId, data.month),
      estate.estateReport(data.agentId),
    ]);
    return { base64: archive.base64, filename: archive.filename, report: JSON.parse(JSON.stringify(report)) as Record<string, unknown> };
  });
