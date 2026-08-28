import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { POLL_DURATIONS, validateDraft, type PollDraft } from "@/lib/polls";

/** Formulário de enquete: pergunta, 2 a 6 opções e prazo de encerramento. */
export function PollComposer({
  value,
  onChange,
  className,
}: {
  value: PollDraft;
  onChange: (draft: PollDraft) => void;
  className?: string;
}) {
  const set = (patch: Partial<PollDraft>) => onChange({ ...value, ...patch });

  return (
    <div className={cn("space-y-3", className)}>
      <Input
        value={value.question}
        onChange={(e) => set({ question: e.target.value })}
        placeholder="Pergunta da enquete"
        maxLength={200}
      />

      <div className="space-y-2">
        {value.options.map((opt, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={opt}
              onChange={(e) => {
                const next = [...value.options];
                next[i] = e.target.value;
                set({ options: next });
              }}
              placeholder={`Opção ${i + 1}`}
              maxLength={60}
            />
            {value.options.length > 2 ? (
              <button
                type="button"
                aria-label="Remover opção"
                onClick={() => set({ options: value.options.filter((_, j) => j !== i) })}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-muted-foreground active:scale-95"
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>
        ))}
      </div>

      {value.options.length < 6 ? (
        <button
          type="button"
          onClick={() => set({ options: [...value.options, ""] })}
          className="flex items-center gap-1.5 text-[13px] font-medium text-primary"
        >
          <Plus className="h-4 w-4" /> Adicionar opção
        </button>
      ) : null}

      <div className="flex items-center gap-2">
        <span className="text-[12px] text-muted-foreground">Encerra em</span>
        {POLL_DURATIONS.map((d) => (
          <button
            key={d.days}
            type="button"
            onClick={() => set({ days: d.days })}
            className={cn(
              "rounded-full border px-3 py-1 text-[12px] transition",
              value.days === d.days ? "border-primary bg-primary/15 text-primary" : "border-white/10 text-muted-foreground",
            )}
          >
            {d.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export const emptyPollDraft: PollDraft = { question: "", options: ["", ""], days: 1 };

export function PollDraftError({ draft }: { draft: PollDraft }) {
  const err = validateDraft(draft);
  if (!err) return null;
  return <div className="text-[12px] text-muted-foreground">{err}</div>;
}

export function usePollDraft() {
  return useState<PollDraft>({ ...emptyPollDraft, options: ["", ""] });
}
