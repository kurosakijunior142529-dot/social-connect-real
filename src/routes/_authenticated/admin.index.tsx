import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Loader2,
  Search,
  ShieldAlert,
  Wallet,
  Users,
  FileStack,
  Receipt,
  ScrollText,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Painel administrativo · Vibely" },
      { name: "description", content: "Visão geral de usuários, conteúdos, transações e logs de moderação." },
      { property: "og:title", content: "Painel administrativo · Vibely" },
      { property: "og:description", content: "Administração do Vibely: usuários, conteúdo e transações." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  beforeLoad: async () => {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw redirect({ to: "/auth" });
    const { data: role } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) throw redirect({ to: "/" });
  },
  component: AdminHome,
});

const CONTENT_KINDS = [
  { id: "post", label: "Posts" },
  { id: "video", label: "Vídeos" },
  { id: "comment", label: "Comentários" },
  { id: "live", label: "Lives" },
  { id: "room", label: "Salas" },
];

const USER_FILTERS = [
  { id: "all", label: "Todos" },
  { id: "new", label: "Novos" },
  { id: "strikes", label: "Com strikes" },
  { id: "suspended", label: "Suspensos" },
  { id: "banned", label: "Banidos" },
];

function AdminHome() {
  const qc = useQueryClient();

  const overview = useQuery({
    queryKey: ["admin-overview"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_overview");
      if (error) throw error;
      return (data ?? {}) as Record<string, number>;
    },
  });

  const [userSearch, setUserSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const users = useQuery({
    queryKey: ["admin-users", userSearch, userFilter],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_users", {
        _search: userSearch || undefined,
        _filter: userFilter,
        _limit: 60,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const [kind, setKind] = useState("post");
  const [contentSearch, setContentSearch] = useState("");
  const content = useQuery({
    queryKey: ["admin-content", kind, contentSearch],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_content", {
        _kind: kind,
        _search: contentSearch || undefined,
        _limit: 60,
      });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const transactions = useQuery({
    queryKey: ["admin-transactions"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_transactions", { _limit: 60 });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const logs = useQuery({
    queryKey: ["admin-logs"],
    queryFn: async () => {
      const { data } = await supabase
        .from("moderation_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);
      return data ?? [];
    },
  });

  async function moderateUser(userId: string, action: string) {
    const reason = window.prompt("Motivo da ação (obrigatório):");
    if (!reason?.trim()) return;
    const { data, error } = await supabase.rpc("admin_moderate", {
      _user_id: userId,
      _action: action,
      _reason: reason.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success(`Aplicado: ${data}`);
    qc.invalidateQueries({ queryKey: ["admin-users"] });
    qc.invalidateQueries({ queryKey: ["admin-logs"] });
    qc.invalidateQueries({ queryKey: ["admin-overview"] });
  }

  async function removeContent(id: string, contentKind: string) {
    const reason = window.prompt("Motivo da remoção (obrigatório):");
    if (!reason?.trim()) return;
    const { error } = await supabase.rpc("admin_delete_content", {
      _kind: contentKind,
      _id: id,
      _reason: reason.trim(),
    });
    if (error) return toast.error(error.message);
    toast.success("Conteúdo removido");
    qc.invalidateQueries({ queryKey: ["admin-content"] });
    qc.invalidateQueries({ queryKey: ["admin-logs"] });
  }

  const o = overview.data ?? {};

  return (
    <div className="space-y-6 pb-24">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-brand text-white">
          <LayoutDashboard className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-black tracking-tight">Painel administrativo</h1>
          <p className="text-sm text-muted-foreground">Usuários, conteúdo, transações e logs</p>
        </div>
      </header>

      <div className="flex flex-wrap gap-2">
        <Link to="/admin/security">
          <Button variant="outline" size="sm" className="rounded-full gap-2">
            <ShieldAlert className="h-4 w-4" /> Denúncias e moderação
          </Button>
        </Link>
        <Link to="/admin/withdrawals">
          <Button variant="outline" size="sm" className="rounded-full gap-2">
            <Wallet className="h-4 w-4" /> Saques
          </Button>
        </Link>
      </div>

      {overview.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Usuários" value={o.users} hint={`+${o.users_new_7d ?? 0} em 7 dias`} />
        <Stat label="Posts" value={o.posts} hint={`+${o.posts_24h ?? 0} em 24h`} />
        <Stat label="Vídeos" value={o.videos} />
        <Stat label="Comentários" value={o.comments} />
        <Stat label="Lives agora" value={o.lives_live} hint={`${o.lives_total ?? 0} no total`} />
        <Stat label="Salas abertas" value={o.rooms_open} />
        <Stat label="Denúncias" value={o.reports_pending} hint={`${o.reports_critical ?? 0} críticas`} danger={(o.reports_critical ?? 0) > 0} />
        <Stat label="Fila da IA" value={o.moderation_pending} />
        <Stat label="Suspensos" value={o.suspended} />
        <Stat label="Banidos" value={o.banned} />
        <Stat label="Saques pendentes" value={o.withdrawals_pending} />
        <Stat label="Moedas ativas" value={o.coins_circulating} hint={`${o.gifts_coins_30d ?? 0} em presentes/30d`} />
      </div>

      <Tabs defaultValue="users">
        <TabsList className="rounded-full">
          <TabsTrigger value="users" className="rounded-full gap-1.5">
            <Users className="h-4 w-4" /> Usuários
          </TabsTrigger>
          <TabsTrigger value="content" className="rounded-full gap-1.5">
            <FileStack className="h-4 w-4" /> Conteúdo
          </TabsTrigger>
          <TabsTrigger value="tx" className="rounded-full gap-1.5">
            <Receipt className="h-4 w-4" /> Transações
          </TabsTrigger>
          <TabsTrigger value="logs" className="rounded-full gap-1.5">
            <ScrollText className="h-4 w-4" /> Logs
          </TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-3 pt-4">
          <SearchBox value={userSearch} onChange={setUserSearch} placeholder="Buscar por @, nome ou id" />
          <div className="flex flex-wrap gap-1.5">
            {USER_FILTERS.map((f) => (
              <Chip key={f.id} active={userFilter === f.id} onClick={() => setUserFilter(f.id)}>
                {f.label}
              </Chip>
            ))}
          </div>
          {users.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {(users.data ?? []).map((u) => {
            const suspended = u.suspended_until && new Date(u.suspended_until) > new Date();
            return (
              <div key={u.id} className="rounded-2xl border p-3 space-y-2">
                <div className="flex items-center gap-2 text-sm flex-wrap">
                  <Link to="/u/$username" params={{ username: u.username }} className="font-semibold hover:underline">
                    @{u.username}
                  </Link>
                  <span className="text-muted-foreground truncate">{u.display_name}</span>
                  {u.is_admin ? <Tag className="bg-primary/15 text-primary">admin</Tag> : null}
                  {u.is_minor ? <Tag className="bg-white/10">menor</Tag> : null}
                  {u.banned_at ? <Tag className="bg-destructive/20 text-destructive">banido</Tag> : null}
                  {suspended ? <Tag className="bg-amber-500/20 text-amber-500">suspenso</Tag> : null}
                </div>
                <div className="text-xs text-muted-foreground tabular">
                  {u.posts} posts · {u.followers} seguidores · {u.coins} moedas · {u.strikes} strikes ·
                  desde {new Date(u.created_at).toLocaleDateString("pt-BR")}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => moderateUser(u.id, "warn")}>
                    Avisar
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-full" onClick={() => moderateUser(u.id, "suspend")}>
                    Suspender
                  </Button>
                  <Button
                    size="sm"
                    className="rounded-full bg-destructive hover:bg-destructive/90"
                    onClick={() => moderateUser(u.id, "ban")}
                  >
                    Banir
                  </Button>
                  {u.banned_at || suspended ? (
                    <Button size="sm" variant="outline" className="rounded-full" onClick={() => moderateUser(u.id, "unban")}>
                      Reverter punição
                    </Button>
                  ) : null}
                </div>
              </div>
            );
          })}
          {!users.isLoading && (users.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum usuário encontrado.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="content" className="space-y-3 pt-4">
          <SearchBox value={contentSearch} onChange={setContentSearch} placeholder="Buscar por texto ou autor" />
          <div className="flex flex-wrap gap-1.5">
            {CONTENT_KINDS.map((k) => (
              <Chip key={k.id} active={kind === k.id} onClick={() => setKind(k.id)}>
                {k.label}
              </Chip>
            ))}
          </div>
          {content.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {(content.data ?? []).map((c) => (
            <div key={`${c.kind}-${c.id}`} className="rounded-2xl border p-3 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium truncate">{c.title}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{c.status}</span>
              </div>
              <div className="text-xs text-muted-foreground">
                {c.owner_username ? `@${c.owner_username}` : "—"} ·{" "}
                {new Date(c.created_at).toLocaleString("pt-BR")}
              </div>
              <div className="flex gap-2">
                {c.kind === "post" || c.kind === "video" ? (
                  <Link to="/p/$id" params={{ id: c.id }}>
                    <Button size="sm" variant="outline" className="rounded-full">
                      Ver
                    </Button>
                  </Link>
                ) : null}
                <Button
                  size="sm"
                  className="rounded-full bg-destructive hover:bg-destructive/90"
                  onClick={() => removeContent(c.id, c.kind)}
                >
                  {c.kind === "live" || c.kind === "room" ? "Encerrar" : "Remover"}
                </Button>
              </div>
            </div>
          ))}
          {!content.isLoading && (content.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nada por aqui.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="tx" className="space-y-2 pt-4">
          {(transactions.data ?? []).map((t) => (
            <div key={`${t.kind}-${t.id}`} className="rounded-2xl border p-3 text-sm flex items-center gap-2">
              <Tag className="bg-white/10">{t.kind}</Tag>
              <span className="text-muted-foreground truncate">{t.username ? `@${t.username}` : "—"}</span>
              <span className="ml-auto shrink-0 tabular">
                {t.coins} moedas{t.amount != null ? ` · R$ ${Number(t.amount).toFixed(2)}` : ""}
              </span>
            </div>
          ))}
          {(transactions.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma transação registrada.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="logs" className="space-y-2 pt-4">
          {(logs.data ?? []).map((a: any) => (
            <div key={a.id} className="rounded-2xl border p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{a.action}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(a.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{a.reason}</p>
              <p className="text-[11px] text-muted-foreground break-all">usuário: {a.user_id}</p>
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Stat({ label, value, hint, danger }: { label: string; value?: number; hint?: string; danger?: boolean }) {
  return (
    <div className={cn("glass rounded-2xl px-3 py-3", danger && "ring-1 ring-destructive/40")}>
      <div className="text-xl font-display font-bold tabular">{value ?? 0}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      {hint ? <div className="text-[10px] text-muted-foreground mt-0.5">{hint}</div> : null}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="pl-9 rounded-full" />
    </div>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)] text-muted-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Tag({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide", className)}>
      {children}
    </span>
  );
}
