import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const MAX_PRODUCTS = 250;

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
  .inputValidator((d: unknown) => z.object({ agentId: z.string().uuid(), products: z.array(product).max(50) }).parse(d))
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
    if ((count ?? 0) + rows.length > MAX_PRODUCTS) throw new Error(`الحد الأقصى ${MAX_PRODUCTS} منتجًا، لديك ${count ?? 0} حاليًا`);
    const { error } = await context.supabase.from("products").insert(rows);
    if (error) throw new Error("تعذّر حفظ المنتجات");
    return { saved: rows.length };
  });

export const getProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ agentId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase.from("agents").select("id").eq("id", data.agentId).eq("user_id", context.userId).maybeSingle();
    if (!agent) throw new Error("لم يتم العثور على المساعد");
    const { data: products, error } = await context.supabase
      .from("products")
      .select("id, name, description, price, currency, shipping, photos, videos, available")
      .eq("agent_id", agent.id)
      .order("created_at", { ascending: false });
    if (error) throw new Error("تعذّر تحميل المنتجات");
    return { products: products ?? [] };
  });

export const deleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("products").delete().eq("id", data.id).eq("user_id", context.userId);
    if (error) throw new Error("تعذّر حذف المنتج");
    return { ok: true };
  });

// Upload one photo/video for a product card. Returns the storage path (owner-scoped).
export const uploadProductMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        agentId: z.string().uuid(),
        fileName: z.string().max(200),
        base64: z.string().max(20 * 1024 * 1024),
        contentType: z.string().max(100),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: agent } = await context.supabase.from("agents").select("id").eq("id", data.agentId).eq("user_id", context.userId).maybeSingle();
    if (!agent) throw new Error("لم يتم العثور على المساعد");
    const isImage = data.contentType.startsWith("image/");
    const isVideo = data.contentType.startsWith("video/");
    if (!isImage && !isVideo) throw new Error("يُقبل فقط صورة أو فيديو");
    const ext = (data.fileName.split(".").pop() || (isImage ? "jpg" : "mp4")).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 5) || "bin";
    const path = `${context.userId}/${agent.id}/${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bytes = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const { error } = await context.supabase.storage.from("product-media").upload(path, bytes, { contentType: data.contentType });
    if (error) throw new Error("تعذّر رفع الملف");
    return { path, kind: isImage ? ("photo" as const) : ("video" as const) };
  });
