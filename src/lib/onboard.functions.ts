import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// Free Google Gemini API (user's own GEMINI_API_KEY on the free tier).
const MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

const SYSTEM = `أنت "ردّ"، مساعد إعداد ذكي داخل تطبيق يربط رقم واتساب الشركة بذكاء اصطناعي يرد على العملاء.
تحدّث بالعربية فقط، بأسلوب ودود ومختصر، واسأل سؤالًا واحدًا في كل رسالة.
مهمتك إعداد المساعد خطوة بخطوة:
1) اسأل عن اسم الشركة/النشاط واسم المساعد الذي سيرد على العملاء.
2) اطلب رقم واتساب الذي سيُربط كاملًا بالصيغة الدولية مع علامة + ورمز الدولة، مثال: +9613123456. إن كتبه بدون + أو بصفر في البداية فاطلب منه كتابته بالصيغة الصحيحة قبل المتابعة.
3) اسأل عن رقم موظف اختياري لإرسال رسالة الاسترداد/التحويل عندما يحتاج العميل إنسانًا (يمكنه التخطي).
4) اسأل باختصار عن شخصية المساعد ومهمته وجملة الترحيب (اقترح قيمًا مناسبة إن لم يحددها).
عندما تكتمل البيانات استدعِ create_agent فورًا.
5) بعد الإنشاء اطلب المعرفة: يمكنه رفع ملف PDF أو نص بزر المرفقات 📎، أو كتابة المعلومات مباشرة (عندها استدعِ add_knowledge_text).
6) ثم أخبره أنك لا تستطيع ربط واتساب بنفسك، واستدعِ generate_pairing_code لإنشاء كود الربط الحقيقي، واشرح الخطوات:
واتساب > الإعدادات > الأجهزة المرتبطة > ربط جهاز > الربط برقم الهاتف بدلًا من ذلك > أدخل الكود.
لا تكتب الكود بنفسك أبدًا؛ سيظهر للمستخدم تلقائيًا مع زرين.
- إذا كتب المستخدم "تم الربط": استدعِ check_connection. إن كانت الحالة open فهنّئه وأخبره أن المساعد يعمل الآن. وإلا أخبره أن الربط لم يكتمل واقترح كودًا جديدًا.
- إذا كتب "انتهت صلاحية الكود": استدعِ generate_pairing_code مرة أخرى.
- إذا رفع ملفًا ستصلك رسالة نظام بنتيجة الرفع؛ أكّد له أنك تعلّمت محتواه.
إذا كان لدى المستخدم مساعد موجود، تحدث عنه مباشرة ولا تبدأ الإعداد من جديد إلا إذا طلب إنشاء مساعد آخر.
لديك بيانات المساعدين وإحصاءاتهم الفعلية مرفقة مع كل طلب. استخدمها عند الإجابة عن أرقام الرسائل والمحادثات والعملاء والصفقات وحالة الربط، ولا تختلق أرقامًا. الإحصاءات خلال آخر 14 يومًا حيث يُذكر ذلك.
لا تخترع أرقامًا أو بيانات لم يقدّمها المستخدم.
أنت أيضًا مدير المساعد الكامل: نفّذ أي طلب يخص التطبيق والمساعد باستخدام الأدوات، ولا تقل إنك لا تستطيع إن وُجدت أداة مناسبة. أمثلة:
- "لا ترد على الرقم X" → block_number. "ارجع رد عليه" → unblock_number.
- تغيير الاسم/الشخصية/المهمة/الترحيب/رقم الموظف/رسالة التحويل، أو إيقاف المساعد وتشغيله → update_agent.
- أي تعليمات سلوك دائمة (مثل: لا تذكر الأسعار، رد بالإنجليزية إن كتب العميل بها، أوقات الدوام...) → add_rule. لعرضها أو مسحها → list_rules / clear_rules.
- عرض ملفات المعرفة أو حذف ملف → list_knowledge / delete_knowledge.
- ربط قاعدة بيانات Supabase ليقرأ المساعد بياناتها الحية: اطلب من المستخدم خطوة بخطوة رابط المشروع (Project URL) ثم مفتاح anon/publishable (من إعدادات المشروع > API)، واختياريًا أسماء الجداول، ثم استدعِ connect_database. إن فشل اشرح السبب بوضوح (مثلًا الحاجة لسياسة قراءة عامة أو كتابة أسماء الجداول). لعرضها أو فصلها → list_databases / remove_database.
- إذا كان للمستخدم أكثر من مساعد ولم يحدد، اسأله أيّها (باستخدام select_agent بالمعرّف).
لا تنفّذ طلبات خارج نطاق التطبيق؛ اعتذر بلطف.`;

const TOOLS = [
  {
    functionDeclarations: [
      {
        name: "create_agent",
        description: "إنشاء المساعد بعد جمع البيانات",
        parameters: {
          type: "OBJECT",
          properties: {
            ai_name: { type: "STRING" },
            whatsapp_number: { type: "STRING", description: "الرقم الكامل كما كتبه المستخدم ويبدأ بـ + ورمز الدولة" },
            employee_number: { type: "STRING", description: "فارغ إن لم يوجد" },
            persona: { type: "STRING" },
            job: { type: "STRING" },
            greeting: { type: "STRING" },
          },
          required: ["ai_name", "whatsapp_number"],
        },
      },
      {
        name: "add_knowledge_text",
        description: "حفظ معلومات نصية كتبها المستخدم كمعرفة للمساعد",
        parameters: {
          type: "OBJECT",
          properties: { title: { type: "STRING" }, content: { type: "STRING" } },
          required: ["title", "content"],
        },
      },
      { name: "generate_pairing_code", description: "إنشاء كود ربط واتساب حقيقي", parameters: { type: "OBJECT", properties: {} } },
      { name: "update_agent", description: "تعديل إعدادات المساعد (أرسل الحقول المطلوب تغييرها فقط)", parameters: { type: "OBJECT", properties: { ai_name: { type: "STRING" }, persona: { type: "STRING" }, job: { type: "STRING" }, greeting: { type: "STRING" }, employee_number: { type: "STRING", description: "none لحذفه" }, handoff_message: { type: "STRING" }, active: { type: "BOOLEAN" } } } },
      { name: "block_number", description: "منع المساعد من الرد على رقم", parameters: { type: "OBJECT", properties: { number: { type: "STRING" } }, required: ["number"] } },
      { name: "unblock_number", description: "إلغاء منع رقم", parameters: { type: "OBJECT", properties: { number: { type: "STRING" } }, required: ["number"] } },
      { name: "list_blocked", description: "عرض الأرقام الممنوعة", parameters: { type: "OBJECT", properties: {} } },
      { name: "add_rule", description: "إضافة تعليمات سلوك دائمة للمساعد", parameters: { type: "OBJECT", properties: { rule: { type: "STRING" } }, required: ["rule"] } },
      { name: "list_rules", description: "عرض التعليمات الحالية", parameters: { type: "OBJECT", properties: {} } },
      { name: "clear_rules", description: "مسح كل التعليمات أو استبدالها بنص جديد", parameters: { type: "OBJECT", properties: { replacement: { type: "STRING" } } } },
      { name: "list_knowledge", description: "عرض ملفات المعرفة", parameters: { type: "OBJECT", properties: {} } },
      { name: "delete_knowledge", description: "حذف ملف معرفة بالمعرّف", parameters: { type: "OBJECT", properties: { id: { type: "STRING" } }, required: ["id"] } },
      { name: "connect_database", description: "ربط قاعدة بيانات Supabase خاصة بالمستخدم", parameters: { type: "OBJECT", properties: { project_url: { type: "STRING" }, anon_key: { type: "STRING" }, tables: { type: "STRING", description: "أسماء جداول مفصولة بفاصلة، اختياري" }, label: { type: "STRING" } }, required: ["project_url", "anon_key"] } },
      { name: "list_databases", description: "عرض قواعد البيانات المربوطة", parameters: { type: "OBJECT", properties: {} } },
      { name: "remove_database", description: "فصل قاعدة بيانات بالمعرّف", parameters: { type: "OBJECT", properties: { id: { type: "STRING" } }, required: ["id"] } },
      { name: "select_agent", description: "اختيار المساعد الذي تُطبَّق عليه الأوامر", parameters: { type: "OBJECT", properties: { id: { type: "STRING" } }, required: ["id"] } },
      { name: "check_connection", description: "فحص حالة ربط واتساب", parameters: { type: "OBJECT", properties: {} } },
    ],
  },
];

type Part = Record<string, unknown>;
type Content = { role: string; parts: Part[] };

async function callGemini(contents: Content[]) {
  const apiKey = process.env["GEMINI_API_KEY"];
  if (!apiKey) throw new Error("مفتاح Gemini غير مضبوط");
  let lastErr = "";
  for (const model of MODELS) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM }] },
          contents,
          tools: TOOLS,
          generationConfig: { temperature: 0.5 },
        }),
      },
    );
    if (!res.ok) {
      lastErr = `${res.status} ${(await res.text()).slice(0, 300)}`;
      console.error("Gemini error", model, lastErr);
      continue;
    }
    const json = (await res.json()) as { candidates?: { content?: Content }[] };
    const content = json.candidates?.[0]?.content;
    if (content?.parts?.length) return content;
  }
  if (lastErr.startsWith("429")) throw new Error("تم تجاوز الحد المجاني المؤقت لـ Gemini، حاول بعد دقيقة");
  throw new Error("تعذّر الوصول إلى الذكاء الاصطناعي حاليًا");
}

const input = z.object({
  agentId: z.string().uuid().nullable(),
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), text: z.string() })),
});

export const onboardChat = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data, context }) => {
    let agentId = data.agentId;
    let pairingCode: string | null = null;
    let connected = false;
    const origin = (() => {
      try {
        return new URL(getRequest().url).origin;
      } catch {
        return "";
      }
    })();

    const since = new Date(Date.now() - 13 * 86400000).toISOString();
    const { data: agents, error: agentsError } = await context.supabase.from("agents").select("id, ai_name, whatsapp_number, employee_number, persona, job, greeting, status, active, blocked_numbers, custom_rules").eq("user_id", context.userId);
    if (agentsError) throw new Error("تعذّر تحميل بيانات مساعديك الآن");
    const [{ data: messages, error: messagesError }, { data: contacts, error: contactsError }, { data: deals, error: dealsError }, { data: files, error: filesError }] = await Promise.all([
      agents?.length ? context.supabase.from("messages").select("agent_id, remote_jid, role").in("agent_id", agents.map((a) => a.id)).gte("created_at", since) : Promise.resolve({ data: [], error: null }),
      context.supabase.from("contacts").select("agent_id").eq("user_id", context.userId),
      context.supabase.from("deals").select("agent_id, stage, value").eq("user_id", context.userId),
      context.supabase.from("knowledge_files").select("agent_id, file_name").eq("user_id", context.userId),
    ]);
    if (messagesError || contactsError || dealsError || filesError) throw new Error("تعذّر تحميل بيانات مساعديك الآن");
    if (agentId && !agents?.some((a) => a.id === agentId)) agentId = null;
    if (!agentId && agents?.length) agentId = agents[0]?.id ?? null;
    connected = agents?.some((a) => a.id === agentId && a.status === "open") ?? false;
    const summary = (agents ?? []).map((a) => {
      const m = (messages ?? []).filter((row) => row.agent_id === a.id);
      const d = (deals ?? []).filter((row) => row.agent_id === a.id);
      return {
        ...a,
        messages14d: m.length,
        conversations14d: new Set(m.map((row) => row.remote_jid)).size,
        contacts: (contacts ?? []).filter((row) => row.agent_id === a.id).length,
        deals: d.length,
        wonDeals: d.filter((row) => row.stage === "won").length,
        openDealValue: d.filter((row) => !["won", "lost"].includes(row.stage)).reduce((sum, row) => sum + Number(row.value ?? 0), 0),
        knowledgeFiles: (files ?? []).filter((row) => row.agent_id === a.id).map((row) => row.file_name),
      };
    });
    const contents: Content[] = data.messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.text }],
    }));
    if (contents.length === 0 || contents[0]?.role !== "user") {
      contents.unshift({ role: "user", parts: [{ text: summary.length ? "مرحبًا، أخبرني عن مساعدي الحالي ونشاطه." : "مرحبًا، ابدأ الإعداد معي." }] });
    }
    contents[0]?.parts.unshift({ text: `بيانات حسابي الحالية (من النظام، وليست رسالة مني): ${JSON.stringify(summary)}. ${summary.length ? "لدي مساعدون موجودون، ساعدني في إدارتهم ولا تبدأ إعداد مساعد جديد تلقائيًا." : "لا يوجد مساعد بعد، ابدأ الإعداد."}` });

    async function getAgent() {
      if (!agentId) throw new Error("لم يتم إنشاء المساعد بعد");
      const { data: a } = await context.supabase.from("agents").select("*").eq("user_id", context.userId).eq("id", agentId).maybeSingle();
      if (!a) throw new Error("لم يتم العثور على المساعد");
      return a;
    }

    async function runTool(name: string, rawArgs: Record<string, unknown>) {
      const args = Object.fromEntries(Object.entries(rawArgs).map(([k, v]) => [k, typeof v === "string" ? v : String(v)])) as Record<string, string>;
      const digits = (v?: string) => (v ?? "").replace(/\D/g, "");
      if (name === "select_agent") {
        if (!agents?.some((a) => a.id === args["id"])) return { ok: false, error: "معرّف غير صحيح" };
        agentId = args["id"]!;
        return { ok: true };
      }
      if (name === "update_agent") {
        const a = await getAgent();
        const patch: { ai_name?: string; persona?: string; job?: string; greeting?: string; handoff_message?: string; employee_number?: string | null; active?: boolean } = {};
        for (const k of ["ai_name", "persona", "job", "greeting", "handoff_message"] as const) if (args[k]) patch[k] = args[k];
        if (args["employee_number"]) patch.employee_number = args["employee_number"] === "none" ? null : digits(args["employee_number"]) || null;
        if (typeof rawArgs["active"] === "boolean") patch.active = rawArgs["active"] as boolean;
        if (!Object.keys(patch).length) return { ok: false, error: "لا توجد تغييرات" };
        const { error } = await context.supabase.from("agents").update(patch).eq("id", a.id);
        return error ? { ok: false, error: error.message } : { ok: true, updated: Object.keys(patch) };
      }
      if (name === "block_number" || name === "unblock_number" || name === "list_blocked") {
        const a = await getAgent();
        let list: string[] = a.blocked_numbers ?? [];
        if (name === "list_blocked") return { blocked: list };
        const n = digits(args["number"]);
        if (n.length < 6) return { ok: false, error: "رقم غير صحيح، اطلبه مع رمز الدولة" };
        list = name === "block_number" ? Array.from(new Set([...list, n])) : list.filter((x) => x !== n);
        const { error } = await context.supabase.from("agents").update({ blocked_numbers: list }).eq("id", a.id);
        return error ? { ok: false, error: error.message } : { ok: true, blocked: list };
      }
      if (name === "add_rule" || name === "list_rules" || name === "clear_rules") {
        const a = await getAgent();
        if (name === "list_rules") return { rules: a.custom_rules || "(لا توجد)" };
        const rules = name === "add_rule" ? [a.custom_rules, `- ${args["rule"]}`].filter(Boolean).join("\n") : args["replacement"] ?? "";
        const { error } = await context.supabase.from("agents").update({ custom_rules: rules }).eq("id", a.id);
        return error ? { ok: false, error: error.message } : { ok: true, rules };
      }
      if (name === "list_knowledge") {
        const a = await getAgent();
        const { data: k } = await context.supabase.from("knowledge_files").select("id, file_name").eq("agent_id", a.id);
        return { files: k ?? [] };
      }
      if (name === "delete_knowledge") {
        const a = await getAgent();
        const { error } = await context.supabase.from("knowledge_files").delete().eq("agent_id", a.id).eq("id", args["id"] ?? "");
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      if (name === "connect_database") {
        const a = await getAgent();
        const url = (args["project_url"] ?? "").trim().replace(/\/+$/, "");
        const key = (args["anon_key"] ?? "").trim();
        if (/service_role|sb_secret_/.test(key)) return { ok: false, error: "لا ترسل المفتاح السري، استخدم مفتاح anon/publishable فقط" };
        const { verifySource } = await import("./supabase-source.server");
        const wanted = (args["tables"] ?? "").split(/[,\n،]/).map((t) => t.trim()).filter(Boolean);
        const { tables } = await verifySource(url, key, wanted);
        const { error } = await context.supabase.from("data_sources").insert({ agent_id: a.id, user_id: context.userId, project_url: url, anon_key: key, tables, label: args["label"] || new URL(url).hostname });
        return error ? { ok: false, error: error.message } : { ok: true, tables };
      }
      if (name === "list_databases") {
        const a = await getAgent();
        const { data: ds } = await context.supabase.from("data_sources").select("id, label, tables").eq("agent_id", a.id);
        return { databases: ds ?? [] };
      }
      if (name === "remove_database") {
        const a = await getAgent();
        const { error } = await context.supabase.from("data_sources").delete().eq("agent_id", a.id).eq("id", args["id"] ?? "");
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      const evo = await import("./evolution.server");
      if (name === "create_agent") {
        if (agentId && !data.messages.some((m) => /مساعد جديد|مساعد آخر|أنشئ|إنشاء/.test(m.text))) return { ok: false, error: "يوجد مساعد مسبقًا؛ اطلب تأكيد المستخدم قبل إنشاء آخر" };
        const rawNum = (args["whatsapp_number"] ?? "").trim().replace(/[\s\-()]/g, "").replace(/^00/, "+");
        if (!/^\+[1-9]\d{7,14}$/.test(rawNum)) return { ok: false, error: "الرقم يجب أن يكون كاملًا بالصيغة الدولية ويبدأ بـ + ورمز الدولة (مثال +9613123456). اطلبه من المستخدم مجددًا" };
        args["whatsapp_number"] = rawNum;
        const instanceName = `radd_${context.userId.slice(0, 8)}_${Date.now().toString(36)}`;
        const { data: agent, error } = await context.supabase
          .from("agents")
          .insert({
            user_id: context.userId,
            ai_name: args["ai_name"] ?? "ردّ",
            whatsapp_number: (args["whatsapp_number"] ?? "").replace(/\D/g, ""),
            employee_number: (args["employee_number"] ?? "").replace(/\D/g, "") || null,
            persona: args["persona"] ?? "",
            job: args["job"] ?? "",
            greeting: args["greeting"] ?? "",
            instance_name: instanceName,
          })
          .select()
          .single();
        if (error) return { ok: false, error: error.message };
        agentId = agent.id;
        try {
          await evo.createInstance(instanceName, agent.whatsapp_number, `${origin}/api/public/evolution/${agent.id}`);
        } catch (e) {
          console.error("createInstance", e);
        }
        return { ok: true };
      }
      if (name === "add_knowledge_text") {
        const a = await getAgent();
        const { error } = await context.supabase.from("knowledge_files").insert({
          agent_id: a.id,
          user_id: context.userId,
          file_name: args["title"] ?? "معلومات",
          content: args["content"] ?? "",
        });
        return error ? { ok: false, error: error.message } : { ok: true };
      }
      if (name === "generate_pairing_code") {
        const a = await getAgent();
        const hook = `${origin}/api/public/evolution/${a.id}`;
        try {
          await evo.createInstance(a.instance_name, a.whatsapp_number, hook);
        } catch {
          try {
            await evo.setWebhook(a.instance_name, hook);
          } catch {
            /* ignore */
          }
        }
        const res = (await evo.connectInstance(a.instance_name, a.whatsapp_number)) as Record<string, unknown>;
        const code = (res["pairingCode"] as string | undefined) ?? null;
        if (!code) return { ok: false, error: "لم يرجع الخادم كود ربط" };
        pairingCode = code;
        return { ok: true, note: "الكود ظاهر للمستخدم مع زرين، لا تكتبه" };
      }
      if (name === "check_connection") {
        const a = await getAgent();
        let state = "disconnected";
        try {
          const r = (await evo.instanceState(a.instance_name)) as { instance?: { state?: string }; state?: string };
          state = r?.instance?.state ?? r?.state ?? "disconnected";
        } catch {
          /* ignore */
        }
        await context.supabase.from("agents").update({ status: state }).eq("id", a.id);
        connected = state === "open";
        return { state };
      }
      return { error: "unknown tool" };
    }

    let reply = "";
    for (let i = 0; i < 6; i++) {
      const content = await callGemini(contents);
      contents.push({ role: "model", parts: content.parts });
      const calls = content.parts.filter((p) => p["functionCall"]) as {
        functionCall: { name: string; args?: Record<string, unknown> };
      }[];
      const text = content.parts
        .filter((p) => typeof p["text"] === "string" && !p["thought"])
        .map((p) => p["text"] as string)
        .join("")
        .trim();
      if (calls.length === 0) {
        reply = text;
        break;
      }
      const responses: Part[] = [];
      for (const c of calls) {
        let result: unknown;
        try {
          result = await runTool(c.functionCall.name, c.functionCall.args ?? {});
        } catch (e) {
          result = { ok: false, error: e instanceof Error ? e.message : "خطأ" };
        }
        responses.push({ functionResponse: { name: c.functionCall.name, response: { result } } });
      }
      contents.push({ role: "user", parts: responses });
    }

    return { reply: reply || "حسنًا، لنكمل.", agentId, pairingCode, connected };
  });
