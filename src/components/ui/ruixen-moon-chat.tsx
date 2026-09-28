import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import AnimatedGenerateButton from "@/components/ui/animated-generate-button-shadcn-tailwind";
import { cn } from "@/lib/utils";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { ArrowUpIcon, Paperclip, LayoutDashboard, LogOut, Copy, FileText } from "lucide-react";
import logo from "@/assets/radd-logo.png";
import { onboardChat } from "@/lib/onboard.functions";
import { addKnowledge } from "@/lib/radd.functions";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; text: string; code?: string | undefined; file?: string | undefined };

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

export default function RuixenMoonChat() {
  const navigate = useNavigate();
  const chat = useServerFn(onboardChat);
  const upload = useServerFn(addKnowledge);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const pending = useRef<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function uploadFile(file: File, id: string) {
    const base64 = await toBase64(file);
    const r = await upload({
      data: { agent_id: id, file_name: file.name, base64, is_pdf: file.name.toLowerCase().endsWith(".pdf") },
    });
    return r.chars;
  }

  const send = useCallback(
    async (text: string, history: Msg[], extra?: Partial<Msg>) => {
      const next = text ? [...history, { role: "user" as const, text, ...extra }] : history;
      setMessages(next);
      setBusy(true);
      try {
        const res = await chat({
          data: { agentId, messages: next.map((m) => ({ role: m.role, text: m.text })) },
        });
        if (res.agentId && res.agentId !== agentId) {
          setAgentId(res.agentId);
          // upload files sent before the assistant existed
          for (const f of pending.current.splice(0)) {
            try {
              await uploadFile(f, res.agentId);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "تعذّر رفع الملف");
            }
          }
        }
         setConnected(res.connected);
        setMessages([...next, { role: "assistant", text: res.reply, code: res.pairingCode ?? undefined }]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ");
        setMessages(next);
      } finally {
        setBusy(false);
        textareaRef.current?.focus();
      }
    },
    [agentId, chat, upload],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send("", []);
  }, [send]);

  function submit(text: string) {
    const t = text.trim();
    if (!t || busy) return;
    setMessage("");
    void send(t, messages);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function onFile(file: File) {
    if (file.size > 15 * 1024 * 1024) return toast.error("الحد الأقصى للملف 15 ميجابايت");
    if (!agentId) {
      pending.current.push(file);
      return send(`أرفقت الملف: ${file.name}`, messages, { file: file.name });
    }
    setBusy(true);
    try {
      const chars = await uploadFile(file, agentId);
      setBusy(false);
      await send(
        `أرفقت الملف: ${file.name} (تمت قراءته وحفظه كمعرفة للمساعد، ${chars} حرفًا)`,
        messages,
        { file: file.name },
      );
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "تعذّر قراءة الملف");
    }
  }

  const lastCodeIdx = messages.map((m) => !!m.code).lastIndexOf(true);

  return (
    <div className="relative flex h-dvh w-full flex-col items-center overflow-hidden bg-background" dir="rtl">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* soft brand-color bloom behind everything, like a sunset behind the flower */}
        <div className="absolute inset-x-[-20%] bottom-[-35%] h-[85%] rounded-[100%] bg-[radial-gradient(ellipse_at_center,var(--accent)_0%,var(--primary)_35%,transparent_70%)] opacity-30 blur-3xl" />
        {/* only the top of the flower peeks up from the bottom edge, faded and glowing */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <img
            src={logo}
            alt=""
            className="chat-logo-bloom h-auto w-[min(190vw,90rem)] max-w-none translate-y-[58%] select-none opacity-40"
          />
        </div>
        {/* fade the bloom into the background toward the top */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--background)_0%,transparent_45%,transparent_100%)]" />
      </div>

      <header className="relative z-10 flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="شعار ردّ" className="h-10 w-10 rounded-xl" />
          <span className="brand-text text-2xl font-extrabold">ردّ</span>
        </div>
        <div className="flex gap-1">
          <Link to="/dashboard">
            <Button variant="ghost" size="sm" className="gap-1">
              <LayoutDashboard className="h-4 w-4" /> لوحة التحكم
            </Button>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            aria-label="خروج"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

       <Conversation className="relative z-10 w-full max-w-3xl min-h-0">
        <ConversationContent className="gap-5 px-4 py-6">
        {messages.length === 0 && !busy && (
          <div className="pt-24 text-center">
            <h1 className="brand-text text-4xl font-extrabold">مساعد ردّ</h1>
             <p className="mt-2 text-muted-foreground">أنا هنا لمساعدتك.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <Message key={i} from={m.role} className={cn("max-w-[90%]", m.role === "user" ? "self-start" : "self-end")}>
            <MessageContent className={cn("text-sm leading-7", m.role === "user" ? "rounded-md bg-secondary px-4 py-3 text-secondary-foreground" : "px-1 py-2 text-foreground")}>
              {m.file && (
                <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> {m.file}
                </div>
              )}
               <MessageResponse className="[&_ol]:pr-5 [&_ul]:pr-5">{m.text}</MessageResponse>
              {m.code && (
                <div className="mt-3 space-y-3">
                   <Button
                    type="button"
                    onClick={() => {
                       if (m.code) void navigator.clipboard.writeText(m.code);
                      toast.success("تم نسخ الكود");
                    }}
                     className="brand-gradient flex h-auto w-full items-center justify-center gap-2 rounded-md py-3 font-mono text-2xl font-extrabold text-primary-foreground"
                    dir="ltr"
                  >
                    {m.code} <Copy className="h-4 w-4" />
                   </Button>
                  {i === lastCodeIdx && !connected && (
                    <div className="flex flex-wrap gap-2">
                      <AnimatedGenerateButton disabled={busy} labelIdle="تم الربط" onClick={() => send("تم الربط", messages)} />
                      <AnimatedGenerateButton
                        disabled={busy}
                        variant="outline"
                         labelIdle="انتهت صلاحية الكود"
                        onClick={() => send("انتهت صلاحية الكود", messages)}
                      />
                    </div>
                  )}
                </div>
              )}
            </MessageContent>
          </Message>
        ))}
        {busy && (
           <Message from="assistant" className="self-end"><MessageContent><Shimmer className="text-sm">ردّ يكتب…</Shimmer></MessageContent></Message>
        )}
        </ConversationContent>
        <ConversationScrollButton aria-label="انتقل إلى أحدث رسالة" />
       </Conversation>

      <div className="relative z-10 w-full max-w-3xl px-4 pb-6">
         <PromptInput className="rounded-md border border-border bg-card/80 backdrop-blur-md" onSubmit={({ text }) => submit(text)}>
           <PromptInputTextarea
            ref={textareaRef}
            autoFocus
            value={message}
             onChange={(e) => setMessage(e.target.value)}
            placeholder="اكتب رسالتك..."
             className="min-h-14 max-h-36 bg-transparent text-sm"
          />
           <PromptInputFooter className="px-2 pb-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,.csv,.json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onFile(f);
              }}
            />
             <Button
              variant="ghost"
              size="icon"
               type="button"
              aria-label="إرفاق ملف"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
             <PromptInputSubmit
              disabled={!message.trim() || busy}
               status={busy ? "submitted" : "ready"}
              className="brand-gradient text-primary-foreground"
              aria-label="إرسال"
            >
              <ArrowUpIcon className="h-4 w-4" />
             </PromptInputSubmit>
           </PromptInputFooter>
         </PromptInput>
      </div>
    </div>
  );
}
