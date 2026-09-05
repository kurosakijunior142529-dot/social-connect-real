import { useEffect, useState } from "react";
import { BellRing } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { enablePush, PUSH_MESSAGES, pushPermission, pushSupported, isNativeApp } from "@/lib/push";
import { supabase } from "@/integrations/supabase/client";

export function PushSettings({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState(false);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(pushSupported());
    (async () => {
      const { count } = await (supabase as any)
        .from("push_tokens")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);
      setActive((count ?? 0) > 0 && (isNativeApp() || pushPermission() === "granted"));
    })();
  }, [userId]);

  const activate = async () => {
    setBusy(true);
    const result = await enablePush();
    setBusy(false);
    if (result.status === "registered") {
      setActive(true);
      toast.success(PUSH_MESSAGES.registered);
    } else {
      toast.error(PUSH_MESSAGES[result.status]);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    await (supabase as any).from("push_tokens").delete().eq("user_id", userId);
    setBusy(false);
    setActive(false);
    toast.success("Notificações desativadas neste aparelho.");
  };

  return (
    <section className="space-y-3 rounded-[24px] bg-[color:var(--surface)] p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[color:var(--surface-2)] text-primary">
          <BellRing className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold">Avisos com o app fechado</h2>
          <p className="text-[13px] text-muted-foreground">
            Receba mensagens, chamadas, curtidas, comentários, novos seguidores, lives e presentes mesmo sem
            estar com o Vibely aberto.
          </p>
        </div>
      </div>

      {!supported ? (
        <p className="text-[13px] text-muted-foreground">Este aparelho não aceita esse tipo de aviso.</p>
      ) : active ? (
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/15 px-3 py-1 text-xs font-medium text-primary">Ativado</span>
          <Button type="button" variant="ghost" className="rounded-full" disabled={busy} onClick={deactivate}>
            Desativar
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          className="h-11 w-full rounded-full bg-gradient-brand hover:opacity-90 shadow-elegant"
          disabled={busy}
          onClick={activate}
        >
          {busy ? "Ativando…" : "Ativar notificações"}
        </Button>
      )}
    </section>
  );
}
