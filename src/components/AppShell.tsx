import { Link, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Bot, LogOut } from "lucide-react";
import logo from "@/assets/radd-logo.png";
import type { ReactNode } from "react";

const nav = [
  { to: "/dashboard", label: "المساعدون", icon: Bot },
] as const;


export function AppShell({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-border/60 bg-card/40 backdrop-blur md:min-h-screen md:w-64 md:shrink-0 md:border-b-0 md:border-l">
        <div className="flex items-center justify-between gap-2 px-4 py-4">
          <Link to="/" className="flex items-center gap-2">
            <img src={logo} alt="شعار ردّ" width={36} height={36} className="h-9 w-9" loading="lazy" />
            <span className="brand-text text-2xl font-extrabold">ردّ</span>
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
        <nav className="flex gap-2 overflow-x-auto px-3 pb-4 md:flex-col md:overflow-visible">
          {nav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeProps={{ className: "bg-primary/15 text-primary" }}
              className="flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <main className="flex-1 px-4 py-8 md:px-8">
        <div className="mx-auto max-w-5xl">
          <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-extrabold">{title}</h1>
              {subtitle ? <p className="mt-1 text-muted-foreground">{subtitle}</p> : null}
            </div>
            {action}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
