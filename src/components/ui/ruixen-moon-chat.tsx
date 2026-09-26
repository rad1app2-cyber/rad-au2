import { useState, useRef, useEffect, useCallback } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import ReactMarkdown from "react-markdown";
import { toast } from "sonner";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ArrowUpIcon, Paperclip, CheckCircle2, RefreshCw, LayoutDashboard, LogOut, Copy, FileText } from "lucide-react";
import logo from "@/assets/radd-logo.png";
import { onboardChat } from "@/lib/onboard.functions";
import { addKnowledge } from "@/lib/radd.functions";
import { supabase } from "@/integrations/supabase/client";

type Msg = { role: "user" | "assistant"; text: string; code?: string; file?: string };

function useAutoResizeTextarea(minHeight: number, maxHeight: number) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const adjustHeight = useCallback(
    (reset?: boolean) => {
      const t = textareaRef.current;
      if (!t) return;
      t.style.height = `${minHeight}px`;
      if (reset) return;
      t.style.height = `${Math.max(minHeight, Math.min(t.scrollHeight, maxHeight))}px`;
    },
    [minHeight, maxHeight],
  );
  return { textareaRef, adjustHeight };
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
  const [messages, setMessages] = useState<Msg[]>([]);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const pending = useRef<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  const { textareaRef, adjustHeight } = useAutoResizeTextarea(48, 150);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

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
        if (res.connected) setConnected(true);
        setMessages([...next, { role: "assistant", text: res.reply, code: res.pairingCode ?? undefined }]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "حدث خطأ");
        setMessages(next);
      } finally {
        setBusy(false);
        textareaRef.current?.focus();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [agentId, chat],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void send("", []);
  }, [send]);

  function submit() {
    const t = message.trim();
    if (!t || busy) return;
    setMessage("");
    adjustHeight(true);
    void send(t, messages);
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
    <div className="relative flex h-screen w-full flex-col items-center overflow-hidden bg-background">
      {/* Logo in the background */}
      <img
        src={logo}
        alt=""
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 w-[70vmin] -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.07] blur-[1px]"
      />

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

      <div className="relative z-10 w-full max-w-3xl flex-1 space-y-4 overflow-y-auto px-4 pb-4">
        {messages.length === 0 && !busy && (
          <div className="pt-24 text-center">
            <h1 className="brand-text text-4xl font-extrabold">مساعد ردّ</h1>
            <p className="mt-2 text-muted-foreground">لنجهّز مساعد واتساب الخاص بك في دقائق.</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-start" : "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-7",
                m.role === "user"
                  ? "bg-secondary text-secondary-foreground"
                  : "border border-border bg-card/80 text-card-foreground backdrop-blur",
              )}
            >
              {m.file && (
                <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                  <FileText className="h-3.5 w-3.5" /> {m.file}
                </div>
              )}
              <div className="prose prose-sm prose-invert max-w-none">
                <ReactMarkdown>{m.text}</ReactMarkdown>
              </div>
              {m.code && (
                <div className="mt-3 space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      void navigator.clipboard.writeText(m.code!);
                      toast.success("تم نسخ الكود");
                    }}
                    className="brand-gradient flex w-full items-center justify-center gap-2 rounded-xl py-3 font-mono text-2xl font-extrabold tracking-[0.3em] text-primary-foreground"
                    dir="ltr"
                  >
                    {m.code} <Copy className="h-4 w-4" />
                  </button>
                  {i === lastCodeIdx && !connected && (
                    <div className="flex flex-wrap gap-2">
                      <Button disabled={busy} className="gap-1" onClick={() => send("تم الربط", messages)}>
                        <CheckCircle2 className="h-4 w-4" /> تم الربط
                      </Button>
                      <Button
                        disabled={busy}
                        variant="outline"
                        className="gap-1"
                        onClick={() => send("انتهت صلاحية الكود", messages)}
                      >
                        <RefreshCw className="h-4 w-4" /> انتهت صلاحية الكود
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
        {busy && (
          <div className="flex justify-end">
            <div className="flex gap-1 rounded-2xl border border-border bg-card/80 px-4 py-4">
              {[0, 1, 2].map((d) => (
                <span
                  key={d}
                  className="h-2 w-2 animate-bounce rounded-full bg-primary"
                  style={{ animationDelay: `${d * 150}ms` }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="relative z-10 w-full max-w-3xl px-4 pb-6">
        <div className="rounded-xl border border-border bg-card/70 backdrop-blur-md">
          <Textarea
            ref={textareaRef}
            autoFocus
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              adjustHeight();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="اكتب رسالتك..."
            className="min-h-[48px] w-full resize-none border-none bg-transparent px-4 py-3 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
            style={{ overflow: "hidden" }}
          />
          <div className="flex items-center justify-between p-3">
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
              aria-label="إرفاق ملف"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              onClick={submit}
              disabled={!message.trim() || busy}
              size="icon"
              className="brand-gradient text-primary-foreground"
              aria-label="إرسال"
            >
              <ArrowUpIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
