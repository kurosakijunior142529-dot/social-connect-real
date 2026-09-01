import { Moon, Sun } from "lucide-react";
import { useAppTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/** Atalho rápido de tema — mesma preferência usada em Configurações › Aparência. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useAppTheme();
  const next = theme === "dark" ? "light" : "dark";
  return (
    <button
      type="button"
      aria-label={next === "light" ? "Ativar tema claro" : "Ativar tema escuro"}
      title={next === "light" ? "Tema claro" : "Tema escuro"}
      onClick={() => setTheme(next)}
      className={cn(
        "grid h-9 w-9 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-[color:var(--surface-2)] hover:text-foreground",
        className,
      )}
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
