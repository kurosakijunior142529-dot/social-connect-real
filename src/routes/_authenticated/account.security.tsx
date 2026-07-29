import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ChevronLeft, KeyRound, LogOut, Mail, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { signOutAndClearSession } from "@/lib/auth-session";

export const Route = createFileRoute("/_authenticated/account/security")({
  head: () => ({
    meta: [
      { title: "Segurança · Vibely" },
      { name: "description", content: "Altere sua senha, revise sessões ativas e proteja sua conta Vibely." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [signingOthers, setSigningOthers] = useState(false);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Use no mínimo 8 caracteres");
    if (password.length > 72) return toast.error("Senha longa demais");
    if (password !== confirm) return toast.error("As senhas não conferem");
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) return toast.error(error.message);
    setPassword("");
    setConfirm("");
    toast.success("Senha atualizada com sucesso");
  }

  async function signOutOthers() {
    setSigningOthers(true);
    const { error } = await supabase.auth.signOut({ scope: "others" });
    setSigningOthers(false);
    if (error) return toast.error(error.message);
    toast.success("Outras sessões foram encerradas");
  }

  return (
    <div className="space-y-6 pb-6 max-w-lg">
      <header className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/account" })}
          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface)]"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary">sua conta</div>
          <h1 className="text-2xl font-display font-black leading-tight">Segurança</h1>
        </div>
      </header>

      <section className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 space-y-2">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--surface-2)] text-primary">
            <Mail className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">E-mail da conta</div>
            <div className="truncate text-sm font-medium">{user.email}</div>
          </div>
        </div>
      </section>

      <form
        onSubmit={changePassword}
        className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 space-y-4"
      >
        <div className="flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Alterar senha</h2>
        </div>
        <div className="space-y-2">
          <Label htmlFor="np">Nova senha</Label>
          <Input
            id="np"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
            className="rounded-xl"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cp">Confirmar nova senha</Label>
          <Input
            id="cp"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            maxLength={72}
            className="rounded-xl"
          />
        </div>
        <Button type="submit" disabled={saving} className="w-full h-11 rounded-full">
          {saving ? "Salvando…" : "Atualizar senha"}
        </Button>
        <p className="text-[11px] text-muted-foreground">
          Mínimo de 8 caracteres. Use letras, números e símbolos para maior proteção.
        </p>
      </form>

      <section className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-base font-semibold">Sessões</h2>
        </div>
        <p className="text-[13px] text-muted-foreground">
          Se você acha que alguém acessou sua conta, encerre as outras sessões e troque a senha.
        </p>
        <Button
          type="button"
          variant="secondary"
          className="w-full h-11 rounded-full"
          onClick={signOutOthers}
          disabled={signingOthers}
        >
          {signingOthers ? "Encerrando…" : "Encerrar outras sessões"}
        </Button>
        <Button
          type="button"
          variant="destructive"
          className="w-full h-11 rounded-full gap-2"
          onClick={() => signOutAndClearSession(queryClient, navigate)}
        >
          <LogOut className="h-4 w-4" /> Sair desta conta
        </Button>
      </section>
    </div>
  );
}
