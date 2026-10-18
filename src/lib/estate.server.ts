// Estate operations: syncs listings from the client's property platform (via its database
// connection), detects new/changed properties, matches them to customer requests for
// marketing (48h software-enforced limit), books hotel stays without overlap, builds
// monthly Excel archives, and computes conversion / demand-gap reports.

type SourceRow = {
  id: string;
  agent_id: string;
  label: string;
  kind: "database" | "api";
  database_source_id: string | null;
  endpoint: string | null;
  field_map: Record<string, string> | null;
  cursor_offset: number | null;
};

type Normalized = {
  external_id: string;
  title: string;
  category: "rent" | "hotel";
  area: string;
  price: number | null;
  currency: string;
  rooms: number | null;
  furnished: boolean | null;
  description: string;
  photos: string[];
  videos: string[];
  status: string;
  raw: Record<string, unknown>;
};

const pick = (row: Record<string, unknown>, keys: string[]): unknown => {
  for (const k of keys) {
    const v = row[k];
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return null;
};

const asNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(String(v).replace(/[^\d.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
};

const asUrls = (v: unknown): string[] => {
  if (!v) return [];
  const list = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[\s,،]+/) : [v];
  return list.map((x) => String(x).trim()).filter((x) => /^https?:\/\//.test(x));
};

/** Maps a raw platform row to our normalized property shape. field_map overrides defaults. */
export function normalizeRow(row: Record<string, unknown>, map: Record<string, string> = {}): Normalized | null {
  const g = (key: string, fallbacks: string[]) => (map[key] ? pick(row, [map[key]!]) : null) ?? pick(row, fallbacks);
  const id = g("external_id", ["id", "property_id", "property_code", "code", "ref", "uuid"]);
  if (id === null) return null;
  const typeText = String(g("category", ["ad_type", "property_type", "type", "category"]) ?? "").toLowerCase();
  const category: "rent" | "hotel" = /hotel|فندق|شاليه|مفروش|يومي/.test(typeText) ? "hotel" : "rent";
  const media = g("photos", ["photos", "images", "image_urls", "media", "property_media"]);
  const mediaUrls = asUrls(media);
  return {
    external_id: String(id),
    title: String(g("title", ["title", "name", "property_name", "address"]) ?? `عقار ${id}`),
    category,
    area: String(g("area", ["area", "district", "neighborhood", "city", "location", "region"]) ?? ""),
    price: asNum(g("price", ["price", "rent_price", "sale_price", "amount", "monthly_rent"])),
    currency: String(g("currency", ["currency"]) ?? ""),
    rooms: asNum(g("rooms", ["rooms", "bedrooms", "room_count", "num_rooms"])),
    furnished: (() => {
      const v = g("furnished", ["furnished", "is_furnished"]);
      return v === null ? null : /true|1|نعم|مفروش/i.test(String(v));
    })(),
    description: String(g("description", ["description", "notes", "details", "features"]) ?? ""),
    photos: mediaUrls.filter((u) => !/\.(mp4|mov|webm)(\?|$)/i.test(u)),
    videos: mediaUrls.filter((u) => /\.(mp4|mov|webm)(\?|$)/i.test(u)).concat(asUrls(g("videos", ["videos", "video_urls", "video"]))),
    status: String(g("status", ["status", "state", "availability"]) ?? "active"),
    raw: row,
  };
}

/** Pulls rows from one estate source (database kind reuses the user's connected database). */
async function fetchSourceRows(source: SourceRow): Promise<Record<string, unknown>[]> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  if (source.kind === "api" && source.endpoint) {
    const res = await fetch(source.endpoint, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`endpoint ${res.status}`);
    const json = (await res.json()) as unknown;
    const rows = Array.isArray(json) ? json : ((json as { data?: unknown[]; properties?: unknown[] })?.data ?? (json as { properties?: unknown[] })?.properties ?? []);
    return rows as Record<string, unknown>[];
  }
  if (!source.database_source_id) return [];
  const { data: ds } = await supabaseAdmin
    .from("data_sources")
    .select("project_url, anon_key, tables")
    .eq("id", source.database_source_id)
    .maybeSingle();
  if (!ds) return [];
  const { fetchRows } = await import("./supabase-source.server");
  const sets = await fetchRows(ds.project_url, ds.anon_key, ds.tables ?? [], 5, 50000);
  // Property-like tables first; merge everything and let normalizeRow filter.
  const rows: Record<string, unknown>[] = [];
  for (const s of sets.sort((a, b) => Number(/propert|listing|عقار/i.test(b.table)) - Number(/propert|listing|عقار/i.test(a.table)))) {
    rows.push(...s.rows);
  }
  return rows;
}

/** Syncs all enabled sources of an agent into estate_properties; logs new/changed events. */
export async function syncEstate(agentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: sources } = await supabaseAdmin
    .from("estate_sources")
    .select("*")
    .eq("agent_id", agentId)
    .eq("enabled", true);
  const stats = { synced: 0, added: 0, changed: 0, errors: 0 };
  const now = new Date().toISOString();

  for (const s of (sources ?? []) as SourceRow[]) {
    try {
      const rows = await fetchSourceRows(s);
      for (const raw of rows) {
        const n = normalizeRow(raw, s.field_map ?? {});
        if (!n) continue;
        const { data: existing } = await supabaseAdmin
          .from("estate_properties")
          .select("id, price, status, title")
          .eq("source_id", s.id)
          .eq("external_id", n.external_id)
          .maybeSingle();
        if (!existing) {
          const { error } = await supabaseAdmin.from("estate_properties").insert({
            agent_id: agentId,
            source_id: s.id,
            ...n,
            first_seen_at: now,
            seen_at: now,
          });
          if (!error) {
            stats.added++;
            await supabaseAdmin.from("estate_events").insert({
              agent_id: agentId,
              kind: "property_new",
              property_ref: n.title,
              payload: { external_id: n.external_id, price: n.price, area: n.area, rooms: n.rooms },
            });
          }
        } else {
          const changed = existing.price !== n.price || existing.status !== n.status;
          await supabaseAdmin
            .from("estate_properties")
            .update({ ...n, seen_at: now, ...(changed ? { changed_at: now } : {}) })
            .eq("id", existing.id);
          if (changed) {
            stats.changed++;
            await supabaseAdmin.from("estate_events").insert({
              agent_id: agentId,
              kind: n.status !== existing.status && /sold|مباع|مؤجر|rented/i.test(n.status) ? "property_sold" : "property_changed",
              property_ref: n.title,
              payload: { external_id: n.external_id, old_price: existing.price, new_price: n.price, old_status: existing.status, new_status: n.status },
            });
          }
        }
        stats.synced++;
      }
      await supabaseAdmin.from("estate_sources").update({ last_sync_at: now, last_error: null }).eq("id", s.id);
    } catch (e) {
      stats.errors++;
      await supabaseAdmin
        .from("estate_sources")
        .update({ last_error: e instanceof Error ? e.message.slice(0, 300) : "sync failed" })
        .eq("id", s.id);
    }
  }
  return stats;
}

/** Word overlap between a customer's request and a property, plus ±25% price band. */
function matches(request: Record<string, unknown>, p: { area: string; price: number | null; rooms: number | null; title: string; description: string }) {
  const text = `${p.title} ${p.area} ${p.description}`.toLowerCase();
  const wantArea = String(request["area"] ?? request["المنطقة"] ?? "").toLowerCase();
  const wantPrice = asNum(request["budget"] ?? request["price"] ?? request["الميزانية"] ?? request["السعر"]);
  const wantRooms = asNum(request["rooms"] ?? request["الغرف"] ?? request["عدد الغرف"]);
  if (wantArea && !text.includes(wantArea)) return false;
  if (wantPrice && p.price && (p.price < wantPrice * 0.75 || p.price > wantPrice * 1.25)) return false;
  if (wantRooms && p.rooms && p.rooms !== wantRooms) return false;
  return Boolean(wantArea || wantPrice || wantRooms);
}

/**
 * Marketing pass: for each freshly-seen property, find opted-in contacts whose saved
 * request matches, reserve the send with estate_reserve_marketing (48h software limit),
 * then send the offer on WhatsApp.
 */
export async function marketNewProperties(agentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const evo = await import("./evolution.server");
  const { data: agent } = await supabaseAdmin
    .from("agents")
    .select("id, ai_name, instance_name")
    .eq("id", agentId)
    .maybeSingle();
  if (!agent) return { sent: 0 };

  const since = new Date(Date.now() - 3 * 3600e3).toISOString();
  const [{ data: fresh }, { data: contacts }] = await Promise.all([
    supabaseAdmin
      .from("estate_properties")
      .select("id, title, area, price, currency, rooms, description, photos, status")
      .eq("agent_id", agentId)
      .gte("first_seen_at", since)
      .eq("status", "active"),
    supabaseAdmin
      .from("contacts")
      .select("id, phone, full_name, current_request")
      .eq("agent_id", agentId)
      .eq("marketing_opt_in", true)
      .not("current_request", "is", null)
      .neq("lead_status", "closed"),
  ]);

  let sent = 0;
  for (const p of fresh ?? []) {
    for (const c of contacts ?? []) {
      const req = (c.current_request ?? {}) as Record<string, unknown>;
      if (!matches(req, p)) continue;
      try {
        // Software-enforced: throws if this customer got marketing within 48h.
        await supabaseAdmin.rpc("estate_reserve_marketing", {
          p_agent: agentId,
          p_phone: c.phone,
          p_property: p.id,
        });
      } catch {
        continue; // already marketed recently or duplicate reservation
      }
      const line = `🏠 عرض جديد من ${agent.ai_name}: ${p.title}${p.area ? ` — ${p.area}` : ""}${p.price ? ` — ${p.price} ${p.currency ?? ""}`.trim() : ""}${p.rooms ? ` — ${p.rooms} غرف` : ""}`;
      try {
        await evo.sendText(agent.instance_name, c.phone, `${line}\nهل يعجبك؟ أرسل "نعم" لأرسل لك التفاصيل.`);
        for (const url of (p.photos as string[] | null)?.slice(0, 3) ?? []) {
          await evo.sendImage(agent.instance_name, c.phone, url).catch(() => null);
        }
        await supabaseAdmin.from("estate_deliveries").upsert(
          { agent_id: agentId, customer_phone: c.phone, property_id: p.id, status: "sent" },
          { onConflict: "agent_id,customer_phone,property_id" },
        );
        sent++;
      } catch (e) {
        await supabaseAdmin.from("estate_deliveries").upsert(
          {
            agent_id: agentId,
            customer_phone: c.phone,
            property_id: p.id,
            status: "failed",
            error: e instanceof Error ? e.message.slice(0, 200) : "send failed",
          },
          { onConflict: "agent_id,customer_phone,property_id" },
        );
      }
    }
  }
  return { sent };
}

/** Books a hotel stay; the DB exclusion constraint rejects overlapping confirmed stays. */
export async function bookStay(agentId: string, propertyRef: string, phone: string, start: string, end: string, notes = "") {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: prop } = await supabaseAdmin
    .from("estate_properties")
    .select("id, title, category")
    .eq("agent_id", agentId)
    .ilike("title", `%${propertyRef}%`)
    .limit(1)
    .maybeSingle();
  if (!prop) return { ok: false as const, error: `لم أجد عقارًا باسم «${propertyRef}»` };
  const { error } = await supabaseAdmin.from("estate_stays").insert({
    agent_id: agentId,
    property_id: prop.id,
    customer_phone: phone,
    starts_at: start,
    ends_at: end,
    status: "confirmed",
    notes,
  });
  if (error) {
    if (/conflict|exclude|overlap|23P01/i.test(error.message)) {
      return { ok: false as const, error: "العقار محجوز في هذه الفترة، اقترح فترة أو عقارًا آخر" };
    }
    return { ok: false as const, error: error.message };
  }
  return { ok: true as const, property: prop.title };
}

/** Builds the monthly Excel archive and stores its summary snapshot. */
export async function buildMonthlyArchive(agentId: string, month: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const ExcelJS = await import("exceljs");
  const start = `${month}-01T00:00:00.000Z`;
  const endDate = new Date(`${month}-01T00:00:00.000Z`);
  endDate.setUTCMonth(endDate.getUTCMonth() + 1);
  const end = endDate.toISOString();

  const [{ data: contacts }, { data: appts }, { data: events }, { data: props }, { data: offers }] = await Promise.all([
    supabaseAdmin.from("contacts").select("*").eq("agent_id", agentId).gte("created_at", start).lt("created_at", end),
    supabaseAdmin.from("appointments").select("*").eq("agent_id", agentId).gte("created_at", start).lt("created_at", end),
    supabaseAdmin.from("estate_events").select("*").eq("agent_id", agentId).gte("created_at", start).lt("created_at", end),
    supabaseAdmin.from("estate_properties").select("title, area, price, currency, rooms, category, status, first_seen_at").eq("agent_id", agentId),
    supabaseAdmin.from("sent_offers").select("*").eq("agent_id", agentId).gte("created_at", start).lt("created_at", end),
  ]);

  const wb = new ExcelJS.Workbook();
  const addSheet = (name: string, rows: Record<string, unknown>[]) => {
    const ws = wb.addWorksheet(name);
    if (!rows.length) {
      ws.addRow(["(لا توجد بيانات)"]);
      return;
    }
    const cols = Object.keys(rows[0]!);
    ws.addRow(cols);
    ws.getRow(1).font = { bold: true };
    for (const r of rows) ws.addRow(cols.map((c) => (typeof r[c] === "object" ? JSON.stringify(r[c]) : (r[c] as string | number | null))));
  };
  addSheet("العملاء", (contacts ?? []) as Record<string, unknown>[]);
  addSheet("المواعيد", (appts ?? []) as Record<string, unknown>[]);
  addSheet("الأحداث", (events ?? []) as Record<string, unknown>[]);
  addSheet("العقارات", (props ?? []) as Record<string, unknown>[]);
  addSheet("العروض المرسلة", (offers ?? []) as Record<string, unknown>[]);
  const buffer = await wb.xlsx.writeBuffer();

  const snapshot = {
    contacts: contacts?.length ?? 0,
    appointments: appts?.length ?? 0,
    events: events?.length ?? 0,
    offers: offers?.length ?? 0,
    properties: props?.length ?? 0,
  };
  await supabaseAdmin.from("estate_archives").upsert(
    { agent_id: agentId, month, snapshot, finalized: true },
    { onConflict: "agent_id,month" },
  );
  return { snapshot, base64: Buffer.from(buffer as ArrayBuffer).toString("base64"), filename: `archive-${month}.xlsx` };
}

/** Conversion + demand-gap + rejection report for the owner. */
export async function estateReport(agentId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: contacts }, { data: events }, { data: props }, { data: deliveries }] = await Promise.all([
    supabaseAdmin.from("contacts").select("lead_status, current_request, marketing_opt_in").eq("agent_id", agentId),
    supabaseAdmin.from("estate_events").select("kind, payload, created_at").eq("agent_id", agentId).order("created_at", { ascending: false }).limit(500),
    supabaseAdmin.from("estate_properties").select("id, status, area, price, rooms, title").eq("agent_id", agentId),
    supabaseAdmin.from("estate_deliveries").select("status").eq("agent_id", agentId),
  ]);

  const byStatus: Record<string, number> = {};
  for (const c of contacts ?? []) byStatus[c.lead_status ?? "new"] = (byStatus[c.lead_status ?? "new"] ?? 0) + 1;
  const total = contacts?.length ?? 0;
  const closed = byStatus["closed"] ?? 0;

  // Demand gap: saved customer requests with no matching active property.
  let gaps = 0;
  const gapExamples: string[] = [];
  for (const c of contacts ?? []) {
    const req = (c.current_request ?? null) as Record<string, unknown> | null;
    if (!req || !Object.keys(req).length) continue;
    const hit = (props ?? []).some((p) => p.status === "active" && matches(req, { ...p, description: "" }));
    if (!hit) {
      gaps++;
      if (gapExamples.length < 5) gapExamples.push(JSON.stringify(req).slice(0, 120));
    }
  }

  const rejections = (events ?? []).filter((e) => e.kind === "rejection");
  const rejectionReasons: Record<string, number> = {};
  for (const r of rejections) {
    const reason = String((r.payload as Record<string, unknown>)?.["reason"] ?? "غير محدد").slice(0, 60);
    rejectionReasons[reason] = (rejectionReasons[reason] ?? 0) + 1;
  }

  return {
    customers: total,
    byStatus,
    conversionRate: total ? Math.round((closed / total) * 100) : 0,
    properties: props?.length ?? 0,
    activeProperties: (props ?? []).filter((p) => p.status === "active").length,
    soldProperties: (events ?? []).filter((e) => e.kind === "property_sold").length,
    demandGaps: gaps,
    gapExamples,
    rejectionReasons,
    marketingSent: (deliveries ?? []).filter((d) => d.status === "sent").length,
    marketingFailed: (deliveries ?? []).filter((d) => d.status === "failed").length,
  };
}
