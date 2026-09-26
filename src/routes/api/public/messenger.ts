import { createFileRoute } from "@tanstack/react-router";

type MessengerPayload = {
  object?: string;
  entry?: {
    id?: string;
    messaging?: {
      sender?: { id?: string };
      recipient?: { id?: string };
      message?: {
        is_echo?: boolean;
        text?: string;
        attachments?: { type?: string; payload?: { url?: string } }[];
      };
      postback?: { title?: string; payload?: string };
    }[];
  }[];
};

const attachmentLabel: Record<string, string> = {
  audio: "مقطع صوتي",
  image: "صورة",
  video: "مقطع فيديو",
  file: "ملف",
};

export const Route = createFileRoute("/api/public/messenger")({
  server: {
    handlers: {
      // Facebook webhook verification handshake.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const m = await import("@/lib/messenger.server");
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge") ?? "";
        if (mode === "subscribe" && token && token === m.verifyToken()) {
          return new Response(challenge, { headers: { "content-type": "text/plain" } });
        }
        return new Response("forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const raw = await request.text();
        const m = await import("@/lib/messenger.server");
        const ok = await m.verifySignature(raw, request.headers.get("x-hub-signature-256"));
        if (!ok) return new Response("invalid signature", { status: 401 });

        let payload: MessengerPayload = {};
        try {
          payload = JSON.parse(raw) as MessengerPayload;
        } catch {
          return new Response("bad json");
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { buildReply } = await import("@/lib/ai-reply.server");

        for (const entry of payload.entry ?? []) {
          for (const ev of entry.messaging ?? []) {
            const pageId = ev.recipient?.id ?? entry.id ?? "";
            const psid = ev.sender?.id ?? "";
            if (!pageId || !psid || ev.message?.is_echo) continue;

            const attachment = ev.message?.attachments?.[0];
            const text = (ev.message?.text ?? ev.postback?.title ?? "").trim();
            if (!text && !attachment) continue;

            const { data: channel } = await supabaseAdmin
              .from("channels")
              .select("agent_id, page_id, page_access_token")
              .eq("provider", "messenger")
              .eq("page_id", pageId)
              .maybeSingle();
            if (!channel) continue;

            const { data: agent } = await supabaseAdmin
              .from("agents")
              .select("*")
              .eq("id", channel.agent_id)
              .maybeSingle();
            if (!agent || !agent.active) continue;

            let media: { data: string; mimetype: string } | null = null;
            if (attachment?.payload?.url && ["audio", "image", "video"].includes(attachment.type ?? "")) {
              media = await m.fetchAttachment(attachment.payload.url);
            }

            const userText =
              text ||
              `(أرسل العميل ${attachmentLabel[attachment?.type ?? "file"] ?? "مرفقًا"})`;
            const conversationId = `messenger:${psid}`;

            let result;
            try {
              result = await buildReply({
                agent,
                conversationId,
                userText,
                media,
                channel: "messenger",
              });
            } catch (e) {
              console.error("messenger ai failed", e);
              continue;
            }
            if (!result.reply) continue;

            try {
              await m.sendMessengerText(channel.page_id, channel.page_access_token, psid, result.reply);
            } catch (e) {
              console.error("messenger send failed", e);
            }

            // Tell the human employee over WhatsApp when the AI asks for a handoff.
            if (result.handoff && agent.employee_number) {
              try {
                const evo = await import("@/lib/evolution.server");
                await evo.sendText(
                  agent.instance_name,
                  agent.employee_number,
                  [
                    `🔔 طلب تحويل لموظف من «${agent.ai_name}» (ماسنجر)`,
                    `معرّف العميل: ${psid}`,
                    `آخر رسالة: ${userText}`,
                    result.handoffSummary ? `ملخص المحادثة: ${result.handoffSummary}` : "",
                  ]
                    .filter(Boolean)
                    .join("\n"),
                );
              } catch (e) {
                console.error("employee notify failed", e);
              }
            }

            await supabaseAdmin.from("messages").insert([
              { agent_id: agent.id, remote_jid: conversationId, role: "user", content: userText },
              { agent_id: agent.id, remote_jid: conversationId, role: "assistant", content: result.reply },
            ]);
          }
        }

        return new Response("EVENT_RECEIVED");
      },
    },
  },
});
