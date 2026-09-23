import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect } from "react";
import { createThread } from "@/lib/ai-chat.functions";
import vibelyMascot from "@/assets/vibely-mascot.png";

export const Route = createFileRoute("/_authenticated/ai/")({
  ssr: false,
  component: AIIndex,
  head: () => ({ meta: [{ title: "Vibely AI · Gemini" }] }),
});

function AIIndex() {
  const nav = useNavigate();
  const create = useServerFn(createThread);
  useEffect(() => {
    create({ data: {} }).then((t) => nav({ to: "/ai/$threadId", params: { threadId: t.id }, replace: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="grid place-items-center min-h-[60vh] text-muted-foreground text-sm">
      <div className="flex flex-col items-center gap-3">
        <img src={vibelyMascot} alt="Vibely AI" className="h-20 w-20 animate-pulse object-contain" />
        <span>Iniciando nova conversa…</span>
      </div>
    </div>
  );
}
