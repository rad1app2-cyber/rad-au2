import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import AnimatedGenerateButton from "@/components/ui/animated-generate-button-shadcn-tailwind";
import { ImagePlus, Video, X, Loader2 } from "lucide-react";
import { saveProducts, uploadProductMedia } from "@/lib/products.functions";

export type ProductDraft = {
  name: string;
  description: string;
  price: string;
  currency: string;
  shipping: string;
  photos: string[];
  videos: string[];
};

const emptyDraft = (): ProductDraft => ({ name: "", description: "", price: "", currency: "", shipping: "", photos: [], videos: [] });

function toBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/**
 * Interactive product cards inside the onboarding chat. The AI decides how many
 * cards to open; every field is optional and the owner can save any time —
 * only filled cards are stored, each as its own row so media never mixes.
 */
export function ProductCards({ agentId, count, onSaved }: { agentId: string; count: number; onSaved: (saved: number) => void }) {
  const [cards, setCards] = useState<ProductDraft[]>(() => Array.from({ length: Math.min(Math.max(count, 1), 50) }, emptyDraft));
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const save = useServerFn(saveProducts);
  const upload = useServerFn(uploadProductMedia);
  const photoRefs = useRef<(HTMLInputElement | null)[]>([]);
  const videoRefs = useRef<(HTMLInputElement | null)[]>([]);

  const filled = cards.filter((c) => c.name.trim() || c.description.trim() || c.price.trim() || c.photos.length || c.videos.length).length;

  function patch(i: number, p: Partial<ProductDraft>) {
    setCards((prev) => prev.map((c, idx) => (idx === i ? { ...c, ...p } : c)));
  }

  async function onMedia(i: number, file: File, kind: "photo" | "video") {
    if (file.size > 15 * 1024 * 1024) {
      toast.error("الحد الأقصى للملف 15 ميجابايت");
      return;
    }
    const key = `${i}-${kind}`;
    setUploading(key);
    try {
      const base64 = await toBase64(file);
      const r = await upload({ data: { agentId, fileName: file.name, base64, contentType: file.type || (kind === "photo" ? "image/jpeg" : "video/mp4") } });
      patch(i, kind === "photo" ? { photos: [...cards[i]!.photos, r.path].slice(0, 10) } : { videos: [...cards[i]!.videos, r.path].slice(0, 3) });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر رفع الملف");
    } finally {
      setUploading(null);
    }
  }

  async function submit() {
    if (!filled) {
      toast.error("عبّئ بطاقة واحدة على الأقل قبل الحفظ");
      return;
    }
    setSaving(true);
    try {
      const r = await save({
        data: {
          agentId,
          products: cards.map((c) => ({
            name: c.name.trim(),
            description: c.description.trim(),
            price: c.price.trim() && !Number.isNaN(Number(c.price)) ? Number(c.price) : null,
            currency: c.currency.trim(),
            shipping: c.shipping.trim(),
            photos: c.photos,
            videos: c.videos,
          })),
        },
      });
      setDone(true);
      toast.success(`تم حفظ ${r.saved} منتجًا`);
      onSaved(r.saved);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  if (done) return null;

  return (
    <div className="mt-3 space-y-3" dir="rtl">
      <p className="text-xs text-muted-foreground">كل الحقول اختيارية — عبّئ ما تريد واحفظ متى شئت ({filled} معبأة).</p>
      <div className="grid max-h-[28rem] gap-3 overflow-y-auto pl-1 sm:grid-cols-2">
        {cards.map((c, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-border bg-card p-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">منتج {i + 1}</span>
              {cards.length > 1 && (
                <button type="button" aria-label="إزالة البطاقة" className="text-muted-foreground hover:text-destructive" onClick={() => setCards((prev) => prev.filter((_, idx) => idx !== i))}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <input
              value={c.name}
              onChange={(e) => patch(i, { name: e.target.value })}
              placeholder="اسم المنتج"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex gap-2">
              <input
                value={c.price}
                onChange={(e) => patch(i, { price: e.target.value.replace(/[^\d.]/g, "") })}
                placeholder="السعر"
                inputMode="decimal"
                className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
              <input
                value={c.currency}
                onChange={(e) => patch(i, { currency: e.target.value })}
                placeholder="العملة"
                className="w-20 rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <textarea
              value={c.description}
              onChange={(e) => patch(i, { description: e.target.value })}
              placeholder="الوصف"
              rows={2}
              className="w-full resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <input
              value={c.shipping}
              onChange={(e) => patch(i, { shipping: e.target.value })}
              placeholder="الشحن / التوصيل"
              className="w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="flex items-center gap-2">
              <input
                ref={(el) => {
                  photoRefs.current[i] = el;
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onMedia(i, f, "photo");
                }}
              />
              <input
                ref={(el) => {
                  videoRefs.current[i] = el;
                }}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onMedia(i, f, "video");
                }}
              />
              <Button type="button" variant="outline" size="sm" className="gap-1" disabled={uploading !== null} onClick={() => photoRefs.current[i]?.click()}>
                {uploading === `${i}-photo` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />} صورة
              </Button>
              <Button type="button" variant="outline" size="sm" className="gap-1" disabled={uploading !== null} onClick={() => videoRefs.current[i]?.click()}>
                {uploading === `${i}-video` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Video className="h-3.5 w-3.5" />} فيديو
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {c.photos.length ? `${c.photos.length} صور` : ""} {c.videos.length ? `${c.videos.length} فيديو` : ""}
              </span>
            </div>
            {c.photos.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {c.photos.map((p, pi) => (
                  <span key={pi} className="rounded bg-secondary px-1.5 py-0.5 text-[10px] text-secondary-foreground">صورة {pi + 1}</span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <AnimatedGenerateButton disabled={saving || uploading !== null} labelIdle={saving ? "جارٍ الحفظ…" : `حفظ المنتجات (${filled})`} onClick={() => void submit()} />
        <Button type="button" variant="ghost" size="sm" onClick={() => setCards((prev) => (prev.length < 50 ? [...prev, emptyDraft()] : prev))}>
          + بطاقة أخرى
        </Button>
      </div>
    </div>
  );
}
