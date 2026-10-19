import type { Json } from "@/integrations/supabase/types";
// Shared brain for every channel (WhatsApp, Messenger): builds the prompt from the
// agent's persona, files and connected databases, then asks Gemini for a reply.

type AgentRow = {
  id: string;
  ai_name: string;
  persona: string | null;
  job: string | null;
  greeting: string | null;
  employee_number: string | null;
  custom_rules?: string | null;
  user_id?: string;
};

export type MediaPart = { data: string; mimetype: string } | null;

export type ReplyResult = {
  reply: string;
  handoff: boolean;
  handoffSummary: string;
  blocked: boolean;
  photos: string[];
  videos: string[];
};

const MODELS = ["gemini-3.8-flash", "gemini-flash-latest", "gemini-3.1-flash-lite"];

export async function buildReply(opts: {
  agent: AgentRow;
  conversationId: string;
  userText: string;
  media?: MediaPart;
  channel: "whatsapp" | "messenger";
  customerName?: string | undefined;
  /** Drop the newest unanswered customer messages from history (they're already merged into userText). */
  skipPendingUser?: boolean;
}): Promise<ReplyResult> {
  const { agent, conversationId, userText } = opts;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const phone = conversationId.split("@")[0]!.replace(/\D/g, "");
  const [{ data: files }, { data: rawHistory }, { data: sources }, { data: sent }, { data: contact }] = await Promise.all([
    supabaseAdmin.from("knowledge_files").select("file_name, content").eq("agent_id", agent.id),
    supabaseAdmin
      .from("messages")
      .select("role, content")
      .eq("agent_id", agent.id)
      .eq("remote_jid", conversationId)
      .order("created_at", { ascending: false })
      .limit(30),
    supabaseAdmin
      .from("data_sources")
      .select("label, project_url, anon_key, tables")
      .eq("agent_id", agent.id),
    supabaseAdmin.from("sent_offers").select("offer_ref").eq("agent_id", agent.id).eq("customer_phone", phone),
    supabaseAdmin.from("contacts").select("id, request_summary, lead_status").eq("agent_id", agent.id).eq("phone", phone).maybeSingle(),
  ]);
  let history = rawHistory ?? [];
  if (opts.skipPendingUser) {
    const firstAnswered = history.findIndex((h) => h.role !== "user");
    history = firstAnswered === -1 ? [] : history.slice(firstAnswered);
  }

  // Live data from the client's own database, ranked against what the customer asked for.
  let dbKnowledge = "";
  if (sources && sources.length) {
    const { fetchRows, renderKnowledge } = await import("./supabase-source.server");
    const budget = Math.floor(120000 / sources.length);
    const chunks = await Promise.all(
      sources.map(async (s) => {
        try {
          const sets = await fetchRows(s.project_url, s.anon_key, s.tables ?? []);
          if (!sets.length) return "";
          const body = renderKnowledge(sets, userText, budget);
          return body ? `### قاعدة بيانات ${s.label}\n${body}` : "";
        } catch (e) {
          console.error("data source read failed", s.label, e);
          return "";
        }
      }),
    );
    dbKnowledge = chunks.filter(Boolean).join("\n\n");
  }

  const isFirst = !history || history.length === 0;
  // Big files: split into chunks and keep the ones most related to the question (and recent chat).
  const KNOW_BUDGET = 80000;
  const allFiles = files ?? [];
  const total = allFiles.reduce((n, f) => n + f.content.length, 0);
  let knowledge: string;
  if (total <= KNOW_BUDGET) {
    knowledge = allFiles.map((f) => `### ${f.file_name}\n${f.content}`).join("\n\n");
  } else {
    const query = [userText, ...(history ?? []).slice(0, 4).map((h) => h.content)].join(" ");
    const words = new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 2));
    const chunks = allFiles.flatMap((f) => {
      const out: { name: string; text: string; idx: number; score: number }[] = [];
      for (let i = 0; i < f.content.length; i += 3000) {
        const text = f.content.slice(i, i + 3000);
        const low = text.toLowerCase();
        let score = 0;
        for (const w of words) if (low.includes(w)) score++;
        out.push({ name: f.file_name, text, idx: i, score: score + (i === 0 ? 0.5 : 0) });
      }
      return out;
    });
    chunks.sort((a, b) => b.score - a.score);
    const picked: typeof chunks = [];
    let used = 0;
    for (const c of chunks) {
      if (used + c.text.length > KNOW_BUDGET) break;
      picked.push(c);
      used += c.text.length;
    }
    picked.sort((a, b) => (a.name === b.name ? a.idx - b.idx : a.name.localeCompare(b.name)));
    knowledge = picked.map((c) => `### ${c.name}\n${c.text}`).join("\n\n");
  }

  const system = [
    `أنت مساعد ذكي اسمك «${agent.ai_name}» وتعمل عبر ${opts.channel === "messenger" ? "فيسبوك ماسنجر" : "واتساب"}.`,
    agent.persona ? `شخصيتك: ${agent.persona}` : "",
    agent.job ? `مهمتك: ${agent.job}` : "",
    agent.custom_rules ? `تعليمات صاحب العمل (التزم بها دائمًا):\n${agent.custom_rules}` : "",
    `تحدّث دائمًا باللغة العربية بأسلوب واضح ومهذّب.`,
    `ردودك يجب أن تكون قصيرة جدًا كرسائل واتساب: لا مقدمات ولا تكرار ولا شرح زائد. عند عرض عقارات اعرض كل عقار في سطر أو سطرين فقط.`,
    `قد يرسل العميل عدة رسائل متتالية مدموجة في رسالة واحدة، اقرأها كلها وأجب عن كل أسئلته معًا في ردّ واحد.`,
    `عند عرض أي عقار لأول مرة اذكر دائمًا في المعلومات الأولية: الموقع، السعر، عدد الغرف (إلزامي)، والمساحة إن وُجدت.`,
    `عندما يذكر العميل ميزانية أو سعرًا، ابحث عن العقارات ضمن هامش ±25% من هذا الرقم فقط (مثلًا 140 ألف ← من 105 إلى 175 ألف)، ولا تعرض أسعارًا خارج هذا الهامش إلا إذا طلب العميل ذلك صراحةً. إذا قال إن الخيارات لم تناسبه، اقترح خيارات أخرى ضمن نفس الهامش أو اسأله ماذا لم يناسبه، ولا تقفز لأسعار بعيدة.`,
    `قد يرسل العميل رسائل صوتية أو صورًا أو فيديو، افهم محتواها وأجب عنها مباشرة.`,
    isFirst && agent.greeting
      ? `هذه أول رسالة من العميل، ابدأ ردّك بالترحيب التالي مع ذكر اسمك: ${agent.greeting}`
      : `عرّف بنفسك باسم ${agent.ai_name} عند الحاجة فقط.`,
    agent.employee_number
      ? `إذا طلب العميل صراحةً التحدث مع موظف بشري، أو كان طلبه خارج البيانات المتاحة تمامًا، لا تعطه أي رقم تواصل إطلاقًا، بل أخبره أنه سيتم تحويله لموظف، وأضف في آخر ردّك سطرًا منفصلًا بهذا الشكل حرفيًا:\n[HANDOFF] <ملخص قصير لطلب العميل وما دار في المحادثة>\nهذا السطر داخلي ولن يراه العميل. ممنوع منعًا باتًا ذكر أي أرقام هواتف داخلية أو أرقام موظفين.`
      : "لا تعطِ العميل أي أرقام تواصل داخلية.",
    knowledge
      ? `اعتمد في إجاباتك على المعلومات التالية، ولا تخترع معلومات غير موجودة فيها:\n${knowledge}`
      : "",
    dbKnowledge
      ? [
          `لديك أدناه بيانات فعلية ومحدّثة من قاعدة بيانات العميل، كل سطر يمثل سجلًا كاملًا بحقوله، والسجلات مرتبة بحيث تأتي الأقرب لطلب العميل أولًا.`,
          `قواعد إلزامية:`,
          `- ابحث داخل كل هذه السجلات بنفسك قبل أي رد، وطابق طلب العميل (الموقع، السعر، عدد الغرف، النوع...) مع قيم الحقول.`,
          `- ممنوع منعًا باتًا أن تقول إنك لا تملك التفاصيل أو لا تستطيع البحث أو لا تستطيع الوصول للبيانات، فكل السجلات أمامك.`,
          `- اعرض أفضل 3 إلى 5 سجلات مطابقة فقط بإيجاز (الموقع/السعر/عدد الغرف)، ثم أخبره بعدد المطابقات الكامل واسأله إن أراد المزيد وأرسلها عند طلبه.`,
          `- إذا لم يوجد أي سجل مطابق تمامًا، قل ذلك بوضوح واقترح أقرب البدائل الموجودة في السجلات.`,
          `- لا تحوّل العميل لموظف بسبب البحث في البيانات، التحويل فقط عند طلبه موظفًا أو عند أمر خارج نطاق البيانات.`,
          `البيانات:`,
          dbKnowledge,
        ].join("\n")
      : "",
    contact?.request_summary ? `ما تعرفه عن هذا العميل من قبل: ${contact.request_summary}` : "",
    sent && sent.length
      ? `عروض أُرسلت لهذا العميل سابقًا، لا ترسلها مجددًا إلا إذا طلبها: ${sent.map((o) => o.offer_ref).join("، ")}`
      : "",
    [
      `في آخر كل ردّ أضف أسطرًا داخلية (لن يراها العميل) بهذا الشكل حرفيًا عند الحاجة:`,
      `[LEAD] {"summary":"ملخص طلب العميل المتراكم","status":"new|interested|hot|cold|closed","follow_up_hours":رقم أو null}`,
      `[REQUEST] {"area":"المنطقة","budget":رقم,"rooms":رقم,"type":"بيع|إيجار|فندقي"} عندما يتضح طلب العميل أو يتغيّر، حدّثه كلما تغيّر.`,
      `[REJECT] {"reason":"سبب رفض العميل للعروض المعروضة"} عندما يقول العميل إن العروض لم تعجبه مع ذكر السبب.`,
      `[OFFER] مرجع/اسم كل عرض أرسلته في هذا الرد، كل عرض في سطر`,
      `[PHOTO] رابط صورة (http...) لكل عقار تعرضه إذا كان في بياناته رابط صورة، بحد أقصى 5 صور، كل رابط في سطر.`,
      `[VIDEO] رابط فيديو (http...) لكل عقار تعرضه إذا كان في بياناته رابط فيديو، بحد أقصى 3، كل رابط في سطر.`,
      `[BOOK] {"when":"تاريخ ووقت ISO 8601","property":"العقار","notes":"ملاحظات"} فقط عند اتفاق العميل على موعد معاينة محدد.`,
      `[STAY] {"property":"اسم العقار الفندقي","start":"تاريخ الوصول ISO","end":"تاريخ المغادرة ISO"} فقط عند اتفاق العميل على حجز إقامة فندقية بتواريخ محددة.`,
      `التاريخ الحالي: ${new Date().toISOString()}`,
    ].join("\n"),
  ]
    .filter(Boolean)
    .join("\n");

  const historyContents = [...(history ?? [])].reverse().map((h) => ({
    role: h.role === "assistant" ? "model" : "user",
    parts: [{ text: h.content }],
  }));

  const userParts: Record<string, unknown>[] = [{ text: userText }];
  if (opts.media) {
    userParts.push({
      inlineData: {
        mimeType: opts.media.mimetype || "application/octet-stream",
        data: opts.media.data,
      },
    });
  }

  let blocked = false;
  async function askAI(parts: Record<string, unknown>[]): Promise<string | null> {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      blocked = true;
      console.error("GEMINI_API_KEY missing");
      return null;
    }
    // Free-tier Gemini is often briefly busy (429/503): cycle models, then wait and retry.
    let keyInvalid = false;
    for (const wait of [0, 3000, 8000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      for (const model of MODELS) {
        let res: Response;
        try {
          res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: system }] },
                contents: [...historyContents, { role: "user", parts }],
                generationConfig: { temperature: 0.6, maxOutputTokens: 4096 },
              }),
            },
          );
        } catch (e) {
          console.error("AI network error", model, e);
          continue;
        }
        if (!res.ok) {
          const body = (await res.text()).slice(0, 600);
          console.error("AI error", model, res.status, body);
          if (res.status === 401 || res.status === 403) keyInvalid = true;
          continue;
        }
        const json = (await res.json()) as {
          candidates?: { content?: { parts?: { text?: string }[] } }[];
        };
        const text =
          json.candidates?.[0]?.content?.parts
            ?.map((p) => p.text ?? "")
            .join("")
            .trim() ?? "";
        if (text) return text;
      }
      if (keyInvalid) break;
    }
    blocked = true; // key problem or quota fully exhausted after all retries
    return null;
  }

  let reply = await askAI(userParts);
  if (!reply && opts.media) {
    reply = await askAI([
      { text: `${userText}\n(تعذّر تحليل المرفق، اعتذر بلطف واطلب من العميل توضيح طلبه كتابةً)` },
    ]);
  }

  if (!reply) return { reply: "", handoff: false, handoffSummary: "", blocked, photos: [], videos: [] };

  // Hidden bookkeeping lines: customer memory, request history, sent offers, appointments, hotel stays.
  let stayError = "";
  try {
    const lead = reply.match(/\[LEAD\]\s*(\{.*\})/);
    if (lead && agent.user_id) {
      const j = JSON.parse(lead[1]!) as { summary?: string; status?: string; follow_up_hours?: number | null };
      const row = {
        request_summary: j.summary ?? "",
        lead_status: j.status ?? "new",
        last_message_at: new Date().toISOString(),
        follow_up_at: j.follow_up_hours ? new Date(Date.now() + j.follow_up_hours * 3600e3).toISOString() : null,
      };
      if (contact) await supabaseAdmin.from("contacts").update(row).eq("id", contact.id);
      else
        await supabaseAdmin.from("contacts").insert({
          ...row, user_id: agent.user_id, agent_id: agent.id, phone, full_name: opts.customerName ?? "", source: opts.channel,
        });
    }
    const offers = [...reply.matchAll(/\[OFFER\]\s*(.+)/g)].map((m) => m[1]!.trim()).filter(Boolean);
    if (offers.length)
      await supabaseAdmin.from("sent_offers").insert(offers.map((o) => ({ agent_id: agent.id, customer_phone: phone, offer_ref: o })));
    const book = reply.match(/\[BOOK\]\s*(\{.*\})/);
    if (book) {
      const b = JSON.parse(book[1]!) as { when?: string; property?: string; notes?: string };
      if (b.when && !isNaN(Date.parse(b.when)))
        await supabaseAdmin.from("appointments").insert({
          agent_id: agent.id, customer_phone: phone, customer_name: opts.customerName ?? "",
          property_ref: b.property ?? "", scheduled_at: new Date(b.when).toISOString(), notes: b.notes ?? "",
        });
    }
    // Request tracking: keep the customer's current request (a DB trigger logs its history).
    const req = reply.match(/\[REQUEST\]\s*(\{.*\})/);
    if (req) {
      const r = JSON.parse(req[1]!) as Record<string, unknown>;
      if (Object.keys(r).length) {
        if (contact) await supabaseAdmin.from("contacts").update({ current_request: r as Json }).eq("id", contact.id);
        else if (agent.user_id)
          await supabaseAdmin.from("contacts").insert({
            user_id: agent.user_id, agent_id: agent.id, phone, full_name: opts.customerName ?? "",
            source: opts.channel, current_request: r as Json, lead_status: "new", request_summary: "",
          });
      }
    }
    const rej = reply.match(/\[REJECT\]\s*(\{.*\})/);
    if (rej) {
      const r = JSON.parse(rej[1]!) as { reason?: string };
      if (r.reason)
        await supabaseAdmin.from("estate_events").insert({
          agent_id: agent.id, customer_phone: phone, kind: "rejection", payload: { reason: r.reason },
        });
    }
    // Hotel stay booking: the DB rejects overlapping confirmed stays, so double-booking is impossible.
    const stay = reply.match(/\[STAY\]\s*(\{.*\})/);
    if (stay) {
      const s = JSON.parse(stay[1]!) as { property?: string; start?: string; end?: string };
      if (s.property && s.start && s.end && !isNaN(Date.parse(s.start)) && !isNaN(Date.parse(s.end))) {
        const { bookStay } = await import("./estate.server");
        const booked = await bookStay(agent.id, s.property, phone, new Date(s.start).toISOString(), new Date(s.end).toISOString());
        if (!booked.ok) stayError = booked.error ?? "تعذّر الحجز";
      }
    }
  } catch (e) {
    console.error("bookkeeping failed", e);
  }
  const photos = [...reply.matchAll(/\[PHOTO\]\s*(https?:\/\/\S+)/g)].map((m) => m[1]!).slice(0, 5);
  const videos = [...reply.matchAll(/\[VIDEO\]\s*(https?:\/\/\S+)/g)].map((m) => m[1]!).slice(0, 3);
  reply = reply.replace(/^\s*\[(LEAD|OFFER|BOOK|PHOTO|VIDEO|REQUEST|REJECT|STAY)\].*$/gm, "").trim();
  if (stayError) reply = `${reply}\n${stayError}`.trim();

  const handoffMatch = reply.match(/\[HANDOFF\]\s*:?\s*(?:ملخص\s*:)?\s*([\s\S]*)$/i);
  const clientReply = reply.replace(/\[HANDOFF\][\s\S]*$/i, "").trim();
  return {
    reply: clientReply || "سيتم تحويلك إلى أحد موظفينا للمساعدة، شكرًا لانتظارك.",
    handoff: Boolean(handoffMatch),
    handoffSummary: handoffMatch?.[1]?.trim() ?? "",
    blocked: false,
    photos,
    videos,
  };
}
