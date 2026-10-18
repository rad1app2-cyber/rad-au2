import { createFileRoute } from "@tanstack/react-router";

type EvoPayload = {
  event?: string;
  data?: {
    key?: { remoteJid?: string; fromMe?: boolean; id?: string };
    message?: Record<string, unknown>;
    pushName?: string;
  };
};

function extractText(message: Record<string, unknown> | undefined): string {
  if (!message) return "";
  const m = message as Record<string, any>;
  return (
    m["conversation"] ??
    m["extendedTextMessage"]?.text ??
    m["imageMessage"]?.caption ??
    m["videoMessage"]?.caption ??
    m["documentMessage"]?.caption ??
    m["buttonsResponseMessage"]?.selectedDisplayText ??
    m["listResponseMessage"]?.title ??
    ""
  );
}

/** Detects an incoming media message and returns its kind + declared mime type. */
function detectMedia(message: Record<string, unknown> | undefined) {
  if (!message) return null;
  const m = message as Record<string, any>;
  const candidates: { kind: "audio" | "image" | "video"; node: any }[] = [
    { kind: "audio", node: m["audioMessage"] },
    { kind: "image", node: m["imageMessage"] },
    { kind: "video", node: m["videoMessage"] },
  ];
  for (const c of candidates) {
    if (c.node) return { kind: c.kind, mimetype: (c.node.mimetype as string | undefined) ?? "" };
  }
  return null;
}

const mediaLabel = { audio: "مقطع صوتي", image: "صورة", video: "مقطع فيديو" } as const;

export const Route = createFileRoute("/api/public/evolution/$agentId")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const payload = (await request.json().catch(() => ({}))) as EvoPayload;
        const event = (payload.event ?? "").toLowerCase().replace(/_/g, ".");
        if (event && !event.includes("messages.upsert")) {
          return new Response("ignored");
        }
        const key = payload.data?.key;
        const jid = key?.remoteJid ?? "";
        const text = extractText(payload.data?.message);
        const media = detectMedia(payload.data?.message);
        if (!jid || key?.fromMe || jid.endsWith("@g.us") || (!text.trim() && !media)) {
          return new Response("skip");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: agent } = await supabaseAdmin
          .from("agents")
          .select("*")
          .eq("id", params.agentId)
          .maybeSingle();
        if (!agent || !agent.active) return new Response("no agent");
        const sender = jid.split("@")[0]!.replace(/\D/g, "");
        if ((agent.blocked_numbers ?? []).some((n: string) => sender.endsWith(n) || n.endsWith(sender))) {
          return new Response("blocked");
        }

        const evo = await import("@/lib/evolution.server");

        // Download media (voice notes, photos, videos) so the AI can understand it.
        let mediaPart: { data: string; mimetype: string } | null = null;
        if (media && key?.id) {
          try {
            const got = await evo.getMediaBase64(agent.instance_name, key.id);
            if (got.base64) {
              mediaPart = { data: got.base64, mimetype: got.mimetype || media.mimetype || "" };
            }
          } catch (e) {
            console.error("media download failed", e);
          }
        }

        const thisText = text.trim() || (media ? `(أرسل العميل ${mediaLabel[media.kind]})` : "");

        // Save the message now, then wait so a customer typing several messages gets one combined answer.
        const { data: mine } = await supabaseAdmin
          .from("messages")
          .insert({ agent_id: agent.id, remote_jid: jid, role: "user", content: thisText })
          .select("id")
          .single();
        await new Promise((r) => setTimeout(r, 30000));
        const { data: recent } = await supabaseAdmin
          .from("messages")
          .select("id, role, content")
          .eq("agent_id", agent.id)
          .eq("remote_jid", jid)
          .order("created_at", { ascending: false })
          .limit(30);
        if (!recent?.length || recent[0]!.id !== mine?.id) return new Response("superseded");
        const pending: string[] = [];
        for (const m of recent) {
          if (m.role !== "user") break;
          pending.unshift(m.content);
        }
        const userText = pending.join("\n");

        const { buildReply } = await import("@/lib/ai-reply.server");
        let result;
        try {
          result = await buildReply({
            agent,
            conversationId: jid,
            userText,
            media: mediaPart,
            channel: "whatsapp",
            customerName: payload.data?.pushName,
            skipPendingUser: true,
          });
        } catch (e) {
          console.error("ai failed", e);
          return new Response("ai failed");
        }

        if (!result.reply) {
          // Never leave the customer in silence: tell them we'll get back shortly.
          const sorry = "عذرًا، عندنا ضغط مؤقت. ابعتلي رسالتك مرة تانية بعد دقيقة لو سمحت 🙏";
          try {
            await evo.sendText(agent.instance_name, jid.split("@")[0]!, sorry);
            await supabaseAdmin
              .from("messages")
              .insert({ agent_id: agent.id, remote_jid: jid, role: "assistant", content: sorry });
          } catch {
            /* ignore */
          }
          if (result.blocked && agent.employee_number) {
            try {
              await evo.sendText(
                agent.instance_name,
                agent.employee_number,
                `⚠️ توقف مساعد «${agent.ai_name}» عن الرد بسبب مشكلة في مفتاح الذكاء الاصطناعي أو نفاد رصيده.`,
              );
            } catch {
              /* ignore */
            }
          }
          return new Response("empty");
        }

        const clientNumber = jid.split("@")[0]!;
        try {
          await evo.sendText(agent.instance_name, clientNumber, result.reply);
        } catch (e) {
          console.error("send failed", e);
        }
        for (const url of result.photos) {
          try {
            await evo.sendImage(agent.instance_name, clientNumber, url);
          } catch (e) {
            console.error("photo send failed", url, e);
          }
        }
        for (const url of result.videos) {
          try {
            await evo.sendVideo(agent.instance_name, clientNumber, url);
          } catch (e) {
            console.error("video send failed", url, e);
          }
        }

        // Notify the human employee privately with the client's details and a summary.
        if (result.handoff && agent.employee_number) {
          const notice = [
            `🔔 طلب تحويل لموظف من «${agent.ai_name}»`,
            `اسم العميل: ${payload.data?.pushName || "غير معروف"}`,
            `رقم العميل: +${clientNumber}`,
            `آخر رسالة: ${userText}`,
            result.handoffSummary ? `ملخص المحادثة: ${result.handoffSummary}` : "",
          ]
            .filter(Boolean)
            .join("\n");
          try {
            await evo.sendText(agent.instance_name, agent.employee_number, notice);
          } catch (e) {
            console.error("employee notify failed", e);
          }
        }

        await supabaseAdmin
          .from("messages")
          .insert({ agent_id: agent.id, remote_jid: jid, role: "assistant", content: result.reply });

        return new Response("ok");
      },
      GET: async () => new Response("ok"),
    },
  },
});
