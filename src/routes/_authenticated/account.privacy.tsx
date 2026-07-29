import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, ChevronRight, Eye, CheckCheck, ShieldOff } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/account/privacy")({
  head: () => ({
    meta: [
      { title: "Privacidade · Vibely" },
      { name: "description", content: "Controle quem vê seu status online e seus recibos de leitura." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
          <h1 className="text-2xl font-display font-black leading-tight">Privacidade</h1>
        </div>
      </header>

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
    </div>
  );
}

function Toggle({
  icon,
  label,
  hint,
  checked,
  onChange,
}: {
  icon: React.ReactNode;
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
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
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}
