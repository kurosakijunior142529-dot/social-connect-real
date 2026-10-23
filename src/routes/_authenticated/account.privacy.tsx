import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Eye, CheckCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { usePrivacy } from "@/hooks/use-privacy";
import type { Privacy } from "@/lib/privacy";
import { PrivacyPeople } from "@/components/settings/privacy-people";

export const Route = createFileRoute("/_authenticated/account/privacy")({
  head: () => ({
    meta: [
      { title: "Privacidade e segurança · Vibely" },
      { name: "description", content: "Gerencie seu perfil privado, publicações, Vibes, mensagens, ligações e seguidores no Vibely." },
      { property: "og:title", content: "Privacidade e segurança · Vibely" },
      { property: "og:description", content: "Controle seu público e suas interações no Vibely." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const privacy = usePrivacy(user.id);
  const [saving, setSaving] = useState(false);
  async function savePrivacy(patch: Partial<Privacy>) {
    setSaving(true);
    try {
      const { data, error } = await supabase.from("user_privacy").upsert({ user_id: user.id, ...patch, updated_at: new Date().toISOString() }).select("*").single();
      if (error) throw error;
      queryClient.setQueryData(["user-privacy", user.id], data);
      await queryClient.invalidateQueries({ predicate: q => q.queryKey[0] !== "user-privacy" });
      toast.success("Preferência salva");
    } catch { toast.error("Não foi possível salvar. Tente novamente."); }
    finally { setSaving(false); }
  }
  const choice = (key: keyof Privacy, label: string, options: readonly (readonly [string, string])[], fallback: string, hint?: string) => (
    <div className="space-y-2 py-3" key={key}>
      <label htmlFor={`privacy-${key}`} className="text-sm font-medium">{label}</label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <Select value={String(privacy.data?.[key] ?? fallback)} disabled={saving} onValueChange={value => savePrivacy({ [key]: value })}>
        <SelectTrigger id={`privacy-${key}`} className="w-full"><SelectValue /></SelectTrigger>
        <SelectContent>{options.map(([value, text]) => <SelectItem key={value} value={value}>{text}</SelectItem>)}</SelectContent>
      </Select>
    </div>
  );
  const contacts = [["everyone", "Todos"], ["following", "Quem eu sigo"], ["nobody", "Ninguém"]] as const;

  const profile = useQuery({
    queryKey: ["privacy-profile", user.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("show_online, read_receipts")
        .eq("id", user.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  async function toggle(column: "show_online" | "read_receipts", value: boolean) {
    const { error } = await supabase.from("profiles").update({ [column]: value } as any).eq("id", user.id);
    if (error) return toast.error("Não foi possível salvar");
    queryClient.setQueryData(["privacy-profile", user.id], (old: any) => ({ ...old, [column]: value }));
    queryClient.invalidateQueries({ queryKey: ["me-profile", user.id] });
    toast.success("Preferência salva");
  }

  return (
    <div className="space-y-6 pb-6 max-w-lg">
      <header className="flex items-center gap-2">
        <Button
          type="button"
          variant="ghost" size="icon"
          onClick={() => navigate({ to: "/account" })}
          className="grid h-9 w-9 place-items-center rounded-full bg-[color:var(--surface)]"
          aria-label="Voltar"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-primary">sua conta</div>
          <h1 className="text-2xl font-display font-black leading-tight">Privacidade e segurança</h1>
        </div>
      </header>

      {privacy.isError ? <div role="alert" className="space-y-3"><p>Não foi possível carregar sua privacidade.</p><Button variant="outline" onClick={() => privacy.refetch()}>Tentar novamente</Button></div> : privacy.isLoading ? <Skeleton className="h-32" /> : <>
        <section className="space-y-2 border-t border-border pt-5">
          <h2 className="font-display text-lg font-semibold">Conta e perfil</h2>
          <Toggle icon={<Eye className="h-4 w-4" />} label="Perfil privado" hint="Só seguidores aprovados veem suas publicações e Vibes." checked={privacy.data?.is_private ?? false} disabled={saving} onChange={v => savePrivacy({ is_private: v })} />
          {choice("follows_visibility", "Quem vê seguidores e seguindo", [["everyone", "Todos"], ["followers", "Meus seguidores"], ["me", "Só eu"]], "everyone")}
          {choice("default_post_visibility", "Público padrão de novos posts", [["public", "Público"], ["friends", "Amigos"], ["me", "Só eu"]], "public", "Amigos são pessoas que você segue e que seguem você de volta.")}
        </section>
        <section className="space-y-2 border-t border-border pt-5">
          <h2 className="font-display text-lg font-semibold">Publicações e Vibes</h2>
          {choice("comments_from", "Quem pode comentar nos meus posts", contacts, "everyone")}
          {choice("story_audience", "Quem vê minhas Vibes", [["everyone", "Todos"], ["followers", "Meus seguidores"], ["close_friends", "Amigos próximos"]], "everyone")}
        </section>
        <section className="space-y-2 border-t border-border pt-5">
          <h2 className="font-display text-lg font-semibold">Mensagens e ligações</h2>
          {choice("messages_from", "Quem pode me enviar mensagens", contacts.slice(0, 2), "everyone")}
          {choice("groups_from", "Quem pode me convidar para grupos", contacts, "everyone")}
          {choice("calls_from", "Quem pode me ligar", contacts, "everyone")}
          <Toggle icon={<ShieldOff className="h-4 w-4" />} label="Não perturbe" hint="Bloqueia novas ligações no intervalo escolhido, no horário de Brasília." checked={privacy.data?.dnd_enabled ?? false} disabled={saving} onChange={v => savePrivacy({ dnd_enabled: v })} />
          {privacy.data?.dnd_enabled && <div className="grid grid-cols-2 gap-3 py-3">{(["dnd_start", "dnd_end"] as const).map((key, i) => <div key={key} className="space-y-2"><label htmlFor={key} className="text-sm">{i === 0 ? "Das" : "Até"}</label><Input id={key} type="time" defaultValue={String(privacy.data?.[key] ?? (i === 0 ? "22:00" : "07:00")).slice(0, 5)} disabled={saving} onBlur={e => { if (e.target.value && e.target.value !== privacy.data?.[key]?.slice(0, 5)) void savePrivacy({ [key]: e.target.value }); }} /></div>)}</div>}
          <Toggle icon={<CheckCheck className="h-4 w-4" />} label="Ocultar quando estou digitando" hint="Suas conversas não recebem o indicador de digitação." checked={privacy.data?.hide_typing ?? false} disabled={saving} onChange={v => savePrivacy({ hide_typing: v })} />
        </section>
      </>}

      <h2 className="font-display text-lg font-semibold">Status e leitura</h2>
      {profile.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-3xl" />
          <Skeleton className="h-16 rounded-3xl" />
        </div>
      ) : (
        <div className="rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] divide-y divide-[color:var(--hairline)] overflow-hidden">
          <Toggle
            icon={<Eye className="h-4 w-4" />}
            label="Mostrar status online"
            hint="Outras pessoas veem quando você está ativo"
            checked={profile.data?.show_online ?? true}
            onChange={(v) => toggle("show_online", v)}
          />
          <Toggle
            icon={<CheckCheck className="h-4 w-4" />}
            label="Recibos de leitura"
            hint="Mostrar quando você leu as mensagens"
            checked={profile.data?.read_receipts ?? true}
            onChange={(v) => toggle("read_receipts", v)}
          />
        </div>
      )}

      <PrivacyPeople userId={user.id} />

      <Link
        to="/account/blocked"
        className="flex items-center gap-3 rounded-3xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 py-3.5"
      >
        <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--surface-2)]">
          <ShieldOff className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">Usuários bloqueados</div>
          <div className="text-[11px] text-muted-foreground">Gerencie quem não pode te contatar</div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </Link>
      <Link to="/account/security" className="flex items-center justify-between border-t border-border py-4"><span className="text-sm font-medium">Senha, e-mail e sessões</span><ChevronRight className="h-4 w-4" /></Link>
    </div>
  );
}

function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-[color:var(--surface-2)] text-foreground/80">
        {icon}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-muted-foreground">{hint}</div>
      </div>
      <Switch aria-label={label} checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}
