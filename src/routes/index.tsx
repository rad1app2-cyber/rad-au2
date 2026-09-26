import { createFileRoute, redirect } from "@tanstack/react-router";
import RuixenMoonChat from "@/components/ui/ruixen-moon-chat";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  ssr: false,
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
  },
  head: () => ({
    meta: [
      { title: "ردّ | مساعد ذكي يجهّز واتساب عملك بالمحادثة" },
      { name: "description", content: "تحدث مع مساعد ردّ ليجهّز لك ذكاءً اصطناعيًا عربيًا يرد على عملائك في واتساب." },
      { property: "og:title", content: "ردّ | مساعد واتساب الذكي بالعربية" },
      { property: "og:description", content: "أخبر المساعد برقمك ومعرفتك، واربط واتساب بكود واحد." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RuixenMoonChat,
});
