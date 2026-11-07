import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const product = z.object({
  name: z.string().max(200).default(""),
  description: z.string().max(4000).default(""),
  price: z.number().nullable().default(null),
  currency: z.string().max(10).default(""),
  shipping: z.string().max(1000).default(""),
  photos: z.array(z.string().max(500)).max(10).default([]),
  videos: z.array(z.string().max(500)).max(3).default([]),
});

export const saveProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agentId: z.string().uuid(), products: z.array(product).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase.from("agents").select("id").eq("id", data.agentId).eq("user_id", context.userId).maybeSingle();
    if (!agent) throw new Error("لم يتم العثور على المساعد");
    const own = (p: string) => p.startsWith(`${context.userId}/`);
    // Each card is saved as its own row, so media can never move between products.
    const rows = data.products
      .filter((p) => p.name.trim() || p.description.trim() || p.photos.length || p.videos.length || p.price !== null)
      .map((p) => ({
        ...p,
        photos: p.photos.filter(own),
        videos: p.videos.filter(own),
        agent_id: agent.id,
        user_id: context.userId,
      }));
    if (!rows.length) return { saved: 0 };
    const { count } = await context.supabase.from("products").select("id", { count: "exact", head: true }).eq("agent_id", agent.id);
    if ((count ?? 0) + rows.length > 20) throw new Error(`الحد الأقصى 20 منتجًا، لديك ${count ?? 0} حاليًا`);
    const { error } = await context.supabase.from("products").insert(rows);
    if (error) throw new Error("تعذّر حفظ المنتجات");
    return { saved: rows.length };
  });
