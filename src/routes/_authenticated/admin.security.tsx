import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useState } from "react";
import { ShieldAlert, Loader2, AlertTriangle, Activity, Flag, Power } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/admin/security")({
  head: () => ({
    meta: [
      { title: "Admin · Segurança e moderação" },
      { name: "description", content: "Painel de segurança: denúncias, moderação, punições e alertas." },
      { property: "og:title", content: "Admin · Segurança" },
      { property: "og:description", content: "Denúncias, moderação de conteúdo e controles de emergência." },
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
  component: AdminSecurity,
});

const FLAG_LABELS: Record<string, string> = {
  uploads_enabled: "Uploads e publicações",
  messaging_enabled: "Mensagens e grupos",
  lives_enabled: "Transmissões ao vivo",
  signups_enabled: "Novos cadastros",
  maintenance_mode: "Plataforma ativa (desligue para manutenção)",
};

function AdminSecurity() {
  const qc = useQueryClient();

  const reports = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("*")
        .order("severity", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const queue = useQuery({
    queryKey: ["admin-moderation-queue"],
    queryFn: async () => {
      const { data } = await supabase
        .from("content_moderation")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const events = useQuery({
    queryKey: ["admin-security-events"],
    queryFn: async () => {
      const { data } = await supabase
        .from("security_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const actions = useQuery({
    queryKey: ["admin-moderation-actions"],
    queryFn: async () => {
      const { data } = await supabase
        .from("moderation_actions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  const flags = useQuery({
    queryKey: ["admin-flags"],
    queryFn: async () => {
      const { data } = await supabase.from("feature_flags").select("*").order("key");
      return data ?? [];
    },
  });

  const setFlag = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const { error } = await supabase.rpc("admin_set_flag", { _key: key, _enabled: enabled });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-flags"] });
      qc.invalidateQueries({ queryKey: ["feature-flags"] });
      toast.success("Atualizado");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const resolve = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      const { error } = await supabase.rpc("admin_resolve_report", {
        _report_id: id, _status: status, _note: note ?? undefined,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-reports"] });
      toast.success("Denúncia atualizada");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const moderate = useMutation({
    mutationFn: async (v: { user: string; action: string; reason: string; reportId?: string }) => {
      const { data, error } = await supabase.rpc("admin_moderate", {
        _user_id: v.user, _action: v.action, _reason: v.reason, _report_id: v.reportId ?? undefined,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (applied) => {
      qc.invalidateQueries({ queryKey: ["admin-moderation-actions"] });
      toast.success(`Punição aplicada: ${applied}`);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const [note, setNote] = useState("");

  return (
    <div className="space-y-6 pb-24">
      <header className="flex items-center gap-3">
        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-brand text-white">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">Segurança e moderação</h1>
          <p className="text-sm text-muted-foreground">Denúncias, conteúdo, punições e emergência</p>
        </div>
      </header>

      <Tabs defaultValue="reports">
        <TabsList className="rounded-full">
          <TabsTrigger value="reports" className="rounded-full">Denúncias</TabsTrigger>
          <TabsTrigger value="content" className="rounded-full">Conteúdo</TabsTrigger>
          <TabsTrigger value="events" className="rounded-full">Alertas</TabsTrigger>
          <TabsTrigger value="actions" className="rounded-full">Histórico</TabsTrigger>
          <TabsTrigger value="emergency" className="rounded-full">Emergência</TabsTrigger>
        </TabsList>

        <TabsContent value="reports" className="space-y-3 pt-4">
          {reports.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
          {(reports.data ?? []).map((r: any) => (
            <div
              key={r.id}
              className={cn(
                "rounded-2xl border p-4 space-y-3",
                r.severity === "critical" && "border-destructive/50 bg-destructive/5",
              )}
            >
              <div className="flex items-center gap-2 text-sm">
                <Flag className="h-4 w-4" />
                <span className="font-semibold">{r.category ?? r.reason}</span>
                <span className="text-muted-foreground">· {r.target_type}</span>
                <span className="ml-auto text-xs text-muted-foreground">{r.status}</span>
              </div>
              {r.details ? <p className="text-sm text-muted-foreground">{r.details}</p> : null}
              <p className="text-[11px] text-muted-foreground break-all">alvo: {r.target_id}</p>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" className="rounded-full"
                  onClick={() => resolve.mutate({ id: r.id, status: "dismissed", note })}>
                  Descartar
                </Button>
                <Button size="sm" variant="outline" className="rounded-full"
                  onClick={() => resolve.mutate({ id: r.id, status: "reviewed", note })}>
                  Revisado
                </Button>
                {r.target_type === "user" ? (
                  <>
                    <Button size="sm" variant="outline" className="rounded-full"
                      onClick={() => moderate.mutate({ user: r.target_id, action: "warn", reason: r.category ?? "Denúncia", reportId: r.id })}>
                      Avisar
                    </Button>
                    <Button size="sm" variant="outline" className="rounded-full"
                      onClick={() => moderate.mutate({ user: r.target_id, action: "suspend", reason: r.category ?? "Denúncia", reportId: r.id })}>
                      Suspender
                    </Button>
                    <Button size="sm" className="rounded-full bg-destructive hover:bg-destructive/90"
                      onClick={() => moderate.mutate({ user: r.target_id, action: "ban", reason: r.category ?? "Denúncia", reportId: r.id })}>
                      Banir
                    </Button>
                  </>
                ) : null}
              </div>
            </div>
          ))}
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Nota do moderador (aplicada à próxima ação)"
            className="rounded-2xl"
            rows={2}
          />
        </TabsContent>

        <TabsContent value="content" className="space-y-3 pt-4">
          {(queue.data ?? []).map((c: any) => (
            <div key={c.id} className="rounded-2xl border p-4 space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <AlertTriangle className="h-4 w-4" />
                <span className="font-semibold">{c.content_type}</span>
                <span className="text-muted-foreground">· {c.status}</span>
                <span className="ml-auto text-xs">risco {Number(c.score).toFixed(2)}</span>
              </div>
              <p className="text-xs text-muted-foreground">{c.reason}</p>
              <pre className="text-[11px] text-muted-foreground overflow-x-auto">{JSON.stringify(c.labels)}</pre>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" className="rounded-full"
                  onClick={async () => {
                    const { error } = await supabase.rpc("admin_review_content", { _id: c.id, _status: "approved" });
                    if (error) toast.error(error.message);
                    else { toast.success("Aprovado"); qc.invalidateQueries({ queryKey: ["admin-moderation-queue"] }); }
                  }}>
                  Aprovar
                </Button>
                <Button size="sm" className="rounded-full bg-destructive hover:bg-destructive/90"
                  onClick={async () => {
                    const { error } = await supabase.rpc("admin_review_content", { _id: c.id, _status: "removed" });
                    if (error) toast.error(error.message);
                    else { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["admin-moderation-queue"] }); }
                  }}>
                  Remover
                </Button>
              </div>
            </div>
          ))}
          {!queue.isLoading && (queue.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum conteúdo na fila.</p>
          ) : null}
        </TabsContent>

        <TabsContent value="events" className="space-y-2 pt-4">
          {(events.data ?? []).map((e: any) => (
            <div key={e.id} className={cn(
              "rounded-2xl border p-3 text-sm",
              e.severity === "critical" && "border-destructive/50 bg-destructive/5",
            )}>
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4" />
                <span className="font-medium">{e.event}</span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {new Date(e.created_at).toLocaleString("pt-BR")}
                </span>
              </div>
              <pre className="text-[11px] text-muted-foreground overflow-x-auto">{JSON.stringify(e.metadata)}</pre>
            </div>
          ))}
        </TabsContent>

        <TabsContent value="actions" className="space-y-2 pt-4">
          {(actions.data ?? []).map((a: any) => (
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

        <TabsContent value="emergency" className="space-y-3 pt-4">
          <div className="rounded-2xl border border-destructive/40 bg-destructive/5 p-3 text-xs text-destructive flex gap-2">
            <Power className="h-4 w-4 shrink-0" />
            Desligar um interruptor bloqueia a funcionalidade para todos os usuários
            imediatamente, no banco de dados.
          </div>
          {(flags.data ?? []).map((f: any) => (
            <div key={f.key} className="flex items-center justify-between rounded-2xl border p-4">
              <div>
                <div className="font-medium text-sm">{FLAG_LABELS[f.key] ?? f.key}</div>
                <div className="text-xs text-muted-foreground">{f.note}</div>
              </div>
              <Switch
                checked={f.enabled}
                onCheckedChange={(v) => setFlag.mutate({ key: f.key, enabled: v })}
              />
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
