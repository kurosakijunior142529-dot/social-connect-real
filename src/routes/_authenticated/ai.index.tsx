import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { createThread } from "@/lib/ai-chat.functions";
import { supabase } from "@/integrations/supabase/client";
import vibelyMascot from "@/assets/vibely-mascot.png";

export const Route = createFileRoute("/_authenticated/ai/")({
  ssr: false,
  component: AIIndex,
  head: () => ({
    meta: [
      { title: "Vibely AI · seu assistente" },
      { name: "description", content: "Converse grátis com a Vibely AI, a assistente do Vibely." },
    ],
  }),
});

function AIIndex() {
  const nav = useNavigate();
  const create = useServerFn(createThread);
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  async function open() {
    setFailed(false);
    try {
      // Espera a sessão ficar pronta (no celular ela pode demorar um pouco).
      let session = (await supabase.auth.getSession()).data.session;
      for (let i = 0; !session && i < 10; i++) {
        await new Promise((r) => setTimeout(r, 300));
        session = (await supabase.auth.getSession()).data.session;
      }
      if (!session) throw new Error("sem sessão");
      // Reaproveita a conversa mais recente em vez de criar várias vazias.
      const { data: last } = await (supabase as any)
        .from("ai_threads")
        .select("id")
        .eq("user_id", session.user.id)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const id = last?.id ?? (await create({ data: {} })).id;
      nav({ to: "/ai/$threadId", params: { threadId: id }, replace: true });
    } catch (e) {
      console.error("[ai] abrir falhou", e);
      setFailed(true);
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void open();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="grid place-items-center min-h-[60vh] text-muted-foreground text-sm">
      <div className="flex flex-col items-center gap-3 text-center px-6">
        <img src={vibelyMascot} alt="Vibely AI" className={`h-20 w-20 object-contain ${failed ? "" : "animate-pulse"}`} />
        {failed ? (
          <>
            <span>Não consegui abrir a Vibely AI agora.</span>
            <button
              onClick={() => void open()}
              className="rounded-full bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground"
            >
              Tentar de novo
            </button>
          </>
        ) : (
          <span>Abrindo a Vibely AI…</span>
        )}
      </div>
    </div>
  );
}
