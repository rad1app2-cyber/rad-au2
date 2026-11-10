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
import { ThemeToggle } from "@/components/ThemeToggle";
import { onboardChat } from "@/lib/onboard.functions";
import { addKnowledge, connectAgent, agentStatus, livePairingCode } from "@/lib/radd.functions";
import { ProductCards } from "@/components/ProductCards";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; text: string; code?: string | undefined; qr?: string | undefined; file?: string | undefined; productCards?: number | undefined };

/** Live activity lines shown while the assistant works, based on what the user asked. */
function activitySteps(text: string): string[] {
  const t = text;
  if (!t) return ["يجهّز ردّ المحادثة…", "يقرأ بيانات حسابك…", "يكتب الرد…"];
  if (/كود|QR|ربط|انتهت|تم الربط/i.test(t)) return ["يتصل بخادم واتساب…", "يولّد كود الربط ورمز QR…", "يتحقق من حالة الاتصال…"];
  if (/أرفقت الملف|ملف|pdf/i.test(t)) return ["يرفع الملف…", "يقرأ محتوى الملف…", "يحفظه في معرفة المساعد…", "يكتب الرد…"];
  if (/supabase|قاعدة|جدول|مفتاح/i.test(t)) return ["يتصل بقاعدة البيانات…", "يقرأ الجداول…", "يحفظ الإعدادات…", "يكتب الرد…"];
  if (/منتج|بطاق|سعر/i.test(t)) return ["يفتح كتالوج المنتجات…", "يقرأ المنتجات المحفوظة…", "يحدّث المنتجات…", "يكتب الرد…"];
  if (/احصائ|إحصائ|رسائل|عملاء|موعد|تقرير/i.test(t)) return ["يقرأ إحصائيات مساعدك…", "يحلل المحادثات والمواعيد…", "يكتب الرد…"];
  if (/حظر|رقم|قاعدة|تأخير|ثانية|اسم|غيّر|عدّل|أضف|احذف/i.test(t)) return ["يفهم طلبك…", "يعدّل إعدادات المساعد…", "يحفظ التغييرات…", "يكتب الرد…"];
  return ["يفهم طلبك…", "يراجع معلومات مساعدك…", "يكتب الرد…"];
}

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
  const connect = useServerFn(connectAgent);
  const checkStatus = useServerFn(agentStatus);
  const live = useServerFn(livePairingCode);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const pending = useRef<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [step, setStep] = useState(0);
  const lastUserText = [...messages].reverse().find((m) => m.role === "user")?.text ?? "";
  useEffect(() => {
    if (!busy) return setStep(0);
    const t = setInterval(() => setStep((s) => s + 1), 1600);
    return () => clearInterval(t);
  }, [busy]);

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
        if (agentId && ["إنشاء كود الربط", "انتهت صلاحية الكود", "تم الربط", "الربط بمسح QR"].includes(text)) {
          if (text === "تم الربط") {
            const result = await checkStatus({ data: { id: agentId } });
            setConnected(result.status === "open");
            setMessages([...next, { role: "assistant", text: result.status === "open" ? "تم ربط واتساب، مساعدك جاهز." : "الربط لم يكتمل بعد. أدخل الكود في واتساب أو اطلب كودًا جديدًا." }]);
          } else {
            const result = await connect({ data: { id: agentId, pairing: true } });
            setConnected(result.connected);
            setCodeExpired(false);
            setMessages([
              ...next,
              result.connected
                ? { role: "assistant", text: "واتساب مربوط بالفعل، مساعدك جاهز." }
                : {
                    role: "assistant",
                    text: "اختر طريقة واحدة في واتساب: الأجهزة المرتبطة ← ربط جهاز، ثم امسح رمز QR، أو اضغط «الربط برقم الهاتف بدلًا من ذلك» وأدخل الكود. الاثنان يتجددان تلقائيًا، استخدم الظاهر الآن.",
                    qr: result.qr ?? undefined,
                    code: result.pairingCode ?? undefined,
                  },
            ]);
          }
          return;
        }
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
        setMessages([...next, { role: "assistant", text: res.reply, code: res.pairingCode ?? undefined, qr: res.qr ?? undefined, productCards: res.productCards || undefined }]);
      } catch (e) {
        const error = e instanceof Error ? e.message : "حدث خطأ";
        toast.error(error);
        setMessages([...next, { role: "assistant", text: error }]);
      } finally {
        setBusy(false);
        textareaRef.current?.focus();
      }
    },
    [agentId, chat, upload, connect, checkStatus],
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

  const lastCodeIdx = messages.map((m) => !!(m.code || m.qr)).lastIndexOf(true);
  const [codeExpired, setCodeExpired] = useState(false);

  // The WhatsApp server swaps the code every ~40 seconds; keep the visible one current.
  useEffect(() => {
    if (!agentId || connected || lastCodeIdx < 0 || busy) return;
    setCodeExpired(false);
    let stop = false;
    const tick = async () => {
      try {
        const r = await live({ data: { id: agentId } });
        if (stop) return;
        if (r.state === "open") {
          setConnected(true);
          setMessages((prev) => [...prev, { role: "assistant", text: "تم ربط واتساب بنجاح 🎉 مساعدك جاهز ويرد على الزبائن الآن." }]);
          return;
        }
        if (r.state === "connecting" && (r.pairingCode || r.qr)) {
          setMessages((prev) =>
            prev.map((m, idx) => {
              if (idx !== lastCodeIdx) return m;
              if (m.qr && r.qr && m.qr !== r.qr) return { ...m, qr: r.qr };
              if (m.code && r.pairingCode && m.code !== r.pairingCode) return { ...m, code: r.pairingCode };
              return m;
            }),
          );
        } else if (r.state !== "connecting") {
          setCodeExpired(true);
          return;
        }
      } catch {
        /* keep trying */
      }
      if (!stop) timer = setTimeout(tick, 4000);
    };
    let timer = setTimeout(tick, 4000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [agentId, connected, lastCodeIdx, busy, live]);

  return (
    <div className="relative flex h-dvh w-full flex-col items-center overflow-hidden bg-background" dir="rtl">
      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
        {/* only the top of the flower peeks up from the bottom edge, faded and glowing */}
        <div className="absolute inset-x-0 bottom-0 flex justify-center">
          <img
            src={logo}
            alt=""
            className="chat-logo-bloom h-auto w-[min(140vw,64rem)] max-w-none translate-y-[58%] select-none opacity-25"
          />
        </div>
        {/* fade the bloom into the background toward the top */}
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,var(--background)_0%,transparent_45%,transparent_100%)]" />
      </div>

      <header className="relative z-10 flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-2">
          <img src={logo} alt="شعار ردّ" className="logo-badge h-10 w-10 rounded-xl" />
        </div>
        <div className="flex gap-1">
          <ThemeToggle />
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
              {m.productCards && agentId && (
                <ProductCards
                  agentId={agentId}
                  count={m.productCards}
                  onSaved={(saved) => void send(`حفظت ${saved} منتجًا في بطاقات المنتجات`, messages)}
                />
              )}
              {(m.code || m.qr) && (
                <div className="mt-3 space-y-3">
                  {m.qr && (
                    <img
                      src={m.qr.startsWith("data:") ? m.qr : `data:image/png;base64,${m.qr}`}
                      alt="رمز QR لربط واتساب"
                      className="mx-auto w-64 max-w-full rounded-md border border-border bg-card p-2"
                    />
                  )}
                  {m.code && (
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
                  )}
                  {i === lastCodeIdx && !connected && codeExpired && (
                    <p className="text-xs text-muted-foreground">توقف الخادم عن تجديد الرمز. اطلب رمزًا جديدًا.</p>
                  )}
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
           <Message from="assistant" className="self-end"><MessageContent><Shimmer className="text-sm">{activitySteps(lastUserText)[Math.min(step, activitySteps(lastUserText).length - 1)]!}</Shimmer></MessageContent></Message>
        )}
        </ConversationContent>
        <ConversationScrollButton aria-label="انتقل إلى أحدث رسالة" />
       </Conversation>

      <div className="relative z-10 w-full max-w-3xl px-4 pb-6">
        {agentId && !connected && (
          <div className="mb-3 flex flex-wrap justify-end gap-2">
            <AnimatedGenerateButton disabled={busy} labelIdle="إنشاء كود الربط و QR" onClick={() => send("إنشاء كود الربط", messages)} />
          </div>
        )}
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
