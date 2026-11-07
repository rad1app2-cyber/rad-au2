import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("radd-theme", next ? "dark" : "light");
    } catch {
      /* ignore */
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={dark ? "الوضع الفاتح" : "الوضع الداكن"}
      title={dark ? "الوضع الفاتح" : "الوضع الداكن"}
      onClick={toggle}
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
