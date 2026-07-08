import { X, Search } from "lucide-react";
import { Input } from "@/components/ui/input";

export function ChatSearchBar({
  value,
  onChange,
  onClose,
  count,
}: {
  value: string;
  onChange: (v: string) => void;
  onClose: () => void;
  count: number;
}) {
  return (
    <div className="px-3 py-2 hairline-b flex items-center gap-2 bg-[color:var(--surface)]">
      <Search className="h-4 w-4 text-muted-foreground shrink-0" />
      <Input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Buscar nesta conversa…"
        className="border-0 bg-transparent h-8 p-0 text-[14px] focus-visible:ring-0 focus-visible:ring-offset-0"
      />
      <span className="text-[11px] text-muted-foreground tabular-nums">{count}</span>
      <button
        onClick={onClose}
        className="p-1 rounded-full active:bg-[color:var(--surface-2)]"
        aria-label="Fechar busca"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
