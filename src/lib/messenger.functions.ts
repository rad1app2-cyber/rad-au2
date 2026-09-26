import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function origin() {
  try {
    return new URL(getRequest().url).origin;
  } catch {
    return "";
  }
}

/** Public app id + webhook info the UI needs to start the Facebook login. */
export const facebookConfig = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const m = await import("./messenger.server");
    return {
      appId: m.facebookAppId(),
      configured: Boolean(m.facebookAppId() && process.env["FACEBOOK_APP_SECRET"]),
      webhookUrl: `${origin()}/api/public/messenger`,
      verifyTokenSet: Boolean(m.verifyToken()),
    };
  });

export const listMessengerPages = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { agent_id: string }) => z.object({ agent_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("channels")
      .select("id, page_id, page_name, created_at")
      .eq("agent_id", data.agent_id)
      .eq("provider", "messenger")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/** Step 1: after Facebook login on the client, list the pages the user manages. */
export const fetchFacebookPages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_token: string }) =>
    z.object({ user_token: z.string().min(10) }).parse(d),
  )
  .handler(async ({ data }) => {
    const m = await import("./messenger.server");
    const long = await m.longLivedUserToken(data.user_token);
    const pages = await m.listPages(long);
    if (!pages.length) throw new Error("لا توجد صفحات فيسبوك على هذا الحساب");
    return pages.map((p) => ({ id: p.id, name: p.name }));
  });

/** Step 2: link the chosen page to the assistant and subscribe it to the webhook. */
export const connectMessengerPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        agent_id: z.string().uuid(),
        user_token: z.string().min(10),
        page_id: z.string().min(3),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const m = await import("./messenger.server");
    const long = await m.longLivedUserToken(data.user_token);
    const pages = await m.listPages(long);
    const page = pages.find((p) => p.id === data.page_id);
    if (!page) throw new Error("لم يتم العثور على الصفحة المختارة");

    await m.subscribePage(page.id, page.access_token);

    const { error } = await context.supabase.from("channels").upsert(
      {
        agent_id: data.agent_id,
        user_id: context.userId,
        provider: "messenger",
        page_id: page.id,
        page_name: page.name,
        page_access_token: page.access_token,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "provider,page_id" },
    );
    if (error) throw new Error(error.message);
    return { ok: true, page_name: page.name };
  });

export const disconnectMessengerPage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase
      .from("channels")
      .select("page_id, page_access_token")
      .eq("id", data.id)
      .maybeSingle();
    if (row) {
      const m = await import("./messenger.server");
      try {
        await m.unsubscribePage(row.page_id, row.page_access_token);
      } catch {
        /* ignore */
      }
    }
    const { error } = await context.supabase.from("channels").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
