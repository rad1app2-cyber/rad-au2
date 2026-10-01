// Reads a client's own Supabase project (project URL + anon/publishable key) as a knowledge source.

function clean(url: string) {
  return url.trim().replace(/\/+$/, "");
}

function headers(key: string) {
  const h: Record<string, string> = { apikey: key.trim(), Accept: "application/json" };
  // Legacy JWT anon keys accept a bearer; new opaque sb_publishable_ keys must not send one.
  if (!key.trim().startsWith("sb_")) h["Authorization"] = `Bearer ${key.trim()}`;
  return h;
}

async function rest(url: string, key: string, path: string) {
  const res = await fetch(`${clean(url)}/rest/v1${path}`, { headers: headers(key) });
  const text = await res.text();
  if (!res.ok) throw new Error(`(${res.status}) ${text.slice(0, 300)}`);
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Try to discover tables from the OpenAPI root. Many projects restrict this to service_role. */
export async function listTables(url: string, key: string): Promise<string[]> {
  const accepts = ["application/openapi+json", "application/json"];
  for (const accept of accepts) {
    try {
      const res = await fetch(`${clean(url)}/rest/v1/`, {
        headers: { ...headers(key), Accept: accept },
      });
      if (!res.ok) continue;
      const spec = (await res.json()) as {
        definitions?: Record<string, unknown>;
        paths?: Record<string, unknown>;
        components?: { schemas?: Record<string, unknown> };
      };
      const fromDefs = spec.definitions ? Object.keys(spec.definitions) : [];
      if (fromDefs.length) return fromDefs;
      const fromComponents = spec.components?.schemas ? Object.keys(spec.components.schemas) : [];
      if (fromComponents.length) return fromComponents;
      const fromPaths = Object.keys(spec.paths ?? {})
        .filter((p) => p.startsWith("/") && p.length > 1 && !p.startsWith("/rpc"))
        .map((p) => p.slice(1));
      if (fromPaths.length) return fromPaths;
    } catch {
      /* try next */
    }
  }
  return [];
}

/** Keeps only the tables the anon key can actually read. */
async function readable(url: string, key: string, tables: string[]) {
  const ok: string[] = [];
  await Promise.all(
    tables.map(async (t) => {
      try {
        await rest(url, key, `/${encodeURIComponent(t)}?select=*&limit=1`);
        ok.push(t);
      } catch {
        /* not readable */
      }
    }),
  );
  return ok;
}

/** Checks the URL + key pair without needing service_role privileges. */
export async function verifySource(url: string, key: string, tables: string[] = []) {
  if (!/^https?:\/\//.test(url.trim())) throw new Error("رابط المشروع غير صحيح");

  // A request to a surely-missing table: a valid key gives 404/200-ish, a bad key gives 401/403.
  const probe = await fetch(`${clean(url)}/rest/v1/__radd_probe__?select=*&limit=1`, {
    headers: headers(key),
  }).catch(() => null);
  if (!probe) throw new Error("تعذّر الوصول إلى رابط المشروع، تأكد من الرابط");
  if (probe.status === 401 || probe.status === 403) {
    throw new Error("المفتاح غير صحيح، استخدم مفتاح anon / publishable الخاص بالمشروع");
  }

  const wanted = tables.length ? tables : await listTables(url, key);
  if (!wanted.length) {
    throw new Error(
      "تم قبول المفتاح لكن لم نتمكن من اكتشاف الجداول تلقائيًا، اكتب أسماء الجداول يدويًا مفصولة بفاصلة",
    );
  }

  const list = await readable(url, key, wanted);
  if (!list.length) {
    throw new Error(
      "لم نتمكن من قراءة أي جدول، تأكد من أسماء الجداول ومن وجود سياسة قراءة عامة (anon) عليها",
    );
  }
  return { tables: list };
}

/** Formats one row as a compact readable line, skipping empty values. */
function rowLine(row: Record<string, unknown>, i: number) {
  const parts = Object.entries(row)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  return `${i + 1}) ${parts.join(" | ")}`;
}

/** Pulls a full snapshot of the readable tables to feed the AI. */
export async function snapshot(
  url: string,
  key: string,
  tables: string[] = [],
  maxTables = 50,
  rowsPerTable = 10000,
  totalBudget = 500000,
) {
  const list = tables.length ? tables : await listTables(url, key);
  if (!list.length) return "";
  const picked = list.slice(0, maxTables);
  const perTable = Math.max(20000, Math.floor(totalBudget / picked.length));
  const parts: string[] = [];
  for (const t of picked) {
    try {
      const rows = (await rest(
        url,
        key,
        `/${encodeURIComponent(t)}?select=*&limit=${rowsPerTable}`,
      )) as unknown[];
      if (Array.isArray(rows) && rows.length) {
        const columns = Object.keys(rows[0] as Record<string, unknown>);
        const lines: string[] = [];
        let used = 0;
        for (let i = 0; i < rows.length; i++) {
          const line = rowLine(rows[i] as Record<string, unknown>, i);
          if (used + line.length > perTable) break;
          lines.push(line);
          used += line.length + 1;
        }
        parts.push(
          `#### جدول ${t}\nالأعمدة: ${columns.join(", ")}\nإجمالي الصفوف المقروءة: ${rows.length} (المعروض هنا: ${lines.length})\n${lines.join("\n")}`,
        );
      } else if (Array.isArray(rows)) {
        parts.push(`#### جدول ${t}\n(لا توجد صفوف متاحة)`);
      }
    } catch {
      /* table not readable with anon key */
    }
  }
  return parts.join("\n\n").slice(0, totalBudget + 20000);
}


/* ------------------------------------------------------------------ */
/* Query-aware retrieval: pull every readable row, then rank by query. */
/* ------------------------------------------------------------------ */

export type TableRows = { table: string; rows: Record<string, unknown>[] };

/** Pulls raw rows from the readable tables so we can search them ourselves. */
export async function fetchRows(
  url: string,
  key: string,
  tables: string[] = [],
  maxTables = 40,
  rowsPerTable = 100000,
): Promise<TableRows[]> {
  const list = (tables.length ? tables : await listTables(url, key)).slice(0, maxTables);
  const out: TableRows[] = [];
  // The server caps each response (usually 1000 rows), so page through the whole table.
  const PAGE = 1000;
  await Promise.all(
    list.map(async (t) => {
      const all: Record<string, unknown>[] = [];
      try {
        for (let offset = 0; offset < rowsPerTable; ) {
          const rows = (await rest(
            url,
            key,
            `/${encodeURIComponent(t)}?select=*&limit=${PAGE}&offset=${offset}`,
          )) as unknown[];
          if (!Array.isArray(rows) || !rows.length) break;
          all.push(...(rows as Record<string, unknown>[]));
          offset += rows.length;
          if (rows.length < PAGE && rows.length < 500) break; // last page
        }
      } catch {
        /* not readable with this key, or a later page failed — keep what we have */
      }
      if (all.length) out.push({ table: t, rows: all });
    }),
  );
  return out;
}

const STOP = new Set([
  "من","في","على","عن","الى","إلى","مع","هل","ما","ماذا","هو","هي","اريد","أريد","ابحث","لي",
  "the","and","for","with","have","want","need","please","show","find","me","a","an","of","to",
]);

function tokens(query: string): string[] {
  return Array.from(
    new Set(
      query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(" ")
        .map((w) => w.trim())
        .filter((w) => w.length >= 2 && !STOP.has(w)),
    ),
  );
}

function score(line: string, toks: string[]): number {
  const l = line.toLowerCase();
  let s = 0;
  for (const t of toks) if (l.includes(t)) s += t.length >= 4 ? 2 : 1;
  return s;
}

/**
 * Renders the client's data for the model: every row is a candidate, ranked so the
 * rows matching the customer's request survive the character budget first.
 */
export function renderKnowledge(sets: TableRows[], query: string, budget = 320000): string {
  const toks = tokens(query);
  const blocks: string[] = [];
  const perTable = Math.max(20000, Math.floor(budget / Math.max(1, sets.length)));

  for (const set of sets) {
    const columns = Object.keys(set.rows[0] ?? {});
    const scored = set.rows
      .map((row, i) => {
        const line = rowLine(row, i);
        return { line, s: toks.length ? score(line, toks) : 0 };
      })
      .sort((a, b) => b.s - a.s);

    const lines: string[] = [];
    let used = 0;
    for (const item of scored) {
      if (used + item.line.length > perTable) break;
      lines.push(item.line);
      used += item.line.length + 1;
    }
    blocks.push(
      `#### جدول ${set.table}\nالأعمدة: ${columns.join(", ")}\nإجمالي السجلات في هذا الجدول: ${set.rows.length} — المعروض هنا: ${lines.length} (الأكثر مطابقة لطلب العميل أولًا)\n${lines.join("\n")}`,
    );
  }
  return blocks.join("\n\n");
}
