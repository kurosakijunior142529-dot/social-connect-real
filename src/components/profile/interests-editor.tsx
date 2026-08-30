import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { INTEREST_OPTIONS } from "@/lib/gamification";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const MAX = 8;

export function InterestsEditor({ userId, initial }: { userId: string; initial: string[] }) {
  const qc = useQueryClient();
  const [picked, setPicked] = useState<string[]>(initial ?? []);
  const [saving, setSaving] = useState(false);

  useEffect(() => setPicked(initial ?? []), [initial]);

  function toggle(tag: string) {
    setPicked((prev) => {
      if (prev.includes(tag)) return prev.filter((t) => t !== tag);
      if (prev.length >= MAX) {
        toast.error(`Escolha até ${MAX} interesses`);
        return prev;
      }
      return [...prev, tag];
    });
  }

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("profiles").update({ interests: picked } as any).eq("id", userId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Interesses salvos");
    qc.invalidateQueries({ queryKey: ["me-profile", userId] });
    qc.invalidateQueries({ queryKey: ["profile"] });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {INTEREST_OPTIONS.map((tag) => {
          const active = picked.includes(tag);
          return (
            <button
              key={tag}
              type="button"
              onClick={() => toggle(tag)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "bg-[color:var(--surface-2)] text-muted-foreground hover:text-foreground",
              )}
            >
              {tag}
            </button>
          );
        })}
      </div>
      <Button type="button" onClick={save} disabled={saving} variant="outline" className="rounded-full">
        {saving ? "Salvando…" : "Salvar interesses"}
      </Button>
    </div>
  );
}
