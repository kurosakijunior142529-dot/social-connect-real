import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Brain, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { addMemory, clearMemories, deleteMemory, listMemories } from "@/lib/ai-memory.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/_authenticated/ai/memory")({
  ssr: false,
  component: AiMemoryPage,
  head: () => ({
    meta: [
      { title: "Memória da IA · Vibely" },
      { name: "description", content: "Veja e apague o que a Vibely AI guardou sobre você." },
      { property: "og:title", content: "Memória da IA · Vibely" },
      { property: "og:description", content: "Controle total do que a Vibely AI lembra de você." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

function AiMemoryPage() {
  const qc = useQueryClient();
  const list = useServerFn(listMemories);
  const add = useServerFn(addMemory);
  const del = useServerFn(deleteMemory);
  const clear = useServerFn(clearMemories);
  const [draft, setDraft] = useState("");

  const memories = useQuery({ queryKey: ["ai-memories"], queryFn: () => list() });
  const refresh = () => qc.invalidateQueries({ queryKey: ["ai-memories"] });

  const create = useMutation({
    mutationFn: (memory: string) => add({ data: { memory } }),
    onSuccess: () => { setDraft(""); refresh(); },
    onError: (e: any) => toast.error(String(e?.message ?? "Não consegui salvar").slice(0, 140)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: refresh,
  });

  const wipe = useMutation({
    mutationFn: () => clear({}),
    onSuccess: () => { toast.success("Memória apagada"); refresh(); },
  });

  const rows = memories.data ?? [];

  return (
    <div className="min-h-dvh bg-background text-foreground md:pl-60">
      <header className="hairline-b sticky top-0 z-10 flex items-center gap-3 bg-background/90 px-4 py-3 backdrop-blur">
        <Link to="/ai" className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface-2)]">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Brain className="h-4 w-4 text-primary" /> Memória da IA
          </div>
          <p className="text-[11px] text-muted-foreground">O que a Vibely AI lembra de você</p>
        </div>
        {rows.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="text-red-400"
            onClick={() => { if (confirm("Apagar todas as memórias?")) wipe.mutate({}); }}
          >
            Apagar tudo
          </Button>
        ) : null}
      </header>

      <div className="mx-auto w-full max-w-2xl px-4 py-5 space-y-4">
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && draft.trim().length > 2) create.mutate(draft.trim()); }}
            placeholder="Ex.: prefiro respostas curtas e diretas"
            maxLength={500}
          />
          <Button
            onClick={() => create.mutate(draft.trim())}
            disabled={draft.trim().length < 3 || create.isPending}
            className="shrink-0"
          >
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        {memories.isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl bg-[color:var(--surface)] p-6 text-center">
            <Brain className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nada guardado ainda. Conforme você conversa, a IA salva o que for útil — e você pode apagar quando quiser.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {rows.map((m) => (
              <li
                key={m.id}
                className="flex items-start gap-3 rounded-2xl bg-[color:var(--surface)] px-4 py-3 ring-1 ring-[color:var(--hairline)]"
              >
                <span className="flex-1 text-sm leading-relaxed">{m.memory}</span>
                <button
                  onClick={() => remove.mutate(m.id)}
                  aria-label="Apagar memória"
                  className="mt-0.5 text-muted-foreground hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground">
          Suas memórias são privadas: só você e a IA nesta conta têm acesso.
        </p>
      </div>
    </div>
  );
}
