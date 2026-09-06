import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { VerifiedName } from "@/components/verified-badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGlobalPresence } from "@/lib/presence";
import { MapPin, Loader2, MessageCircle, Tv, User as UserIcon, EyeOff, Compass } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/nearby")({
  ssr: false,
  component: NearbyPage,
});

type NearbyUser = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean | null;
  badge_variant: string | null;
  city: string | null;
  distance_km: number;
  bearing: number;
  i_follow: boolean;
};

const RADIUS_OPTIONS = [5, 25, 50, 150] as const;

function NearbyPage() {
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [radius, setRadius] = useState<number>(50);
  const [selected, setSelected] = useState<NearbyUser | null>(null);
  const { online } = useGlobalPresence(user.id);

  const myLocation = useQuery({
    queryKey: ["my-location", user.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_locations")
        .select("lat, lng, city, updated_at")
        .eq("user_id", user.id)
        .maybeSingle();
      return data ?? null;
    },
  });

  const nearby = useQuery({
    queryKey: ["nearby", user.id, radius],
    enabled: !!myLocation.data,
    refetchInterval: 60_000,
    queryFn: async (): Promise<NearbyUser[]> => {
      const { data, error } = await supabase.rpc("nearby_users", {
        _radius_km: radius,
        _limit: 40,
      });
      if (error) throw error;
      return (data ?? []) as NearbyUser[];
    },
  });

  const share = useMutation({
    mutationFn: async () => {
      if (typeof navigator === "undefined" || !navigator.geolocation) {
        throw new Error("Seu aparelho não permite localização");
      }
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 15_000,
          maximumAge: 300_000,
        });
      });
      const { error } = await supabase.rpc("set_my_location", {
        _lat: position.coords.latitude,
        _lng: position.coords.longitude,
        _city: null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Pronto! Agora você vê quem está por perto");
      queryClient.invalidateQueries({ queryKey: ["my-location", user.id] });
      queryClient.invalidateQueries({ queryKey: ["nearby"] });
    },
    onError: (e: Error) => toast.error(e.message || "Não conseguimos pegar sua localização"),
  });

  const stopSharing = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("stop_sharing_location");
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Você saiu do mapa");
      queryClient.invalidateQueries({ queryKey: ["my-location", user.id] });
      queryClient.invalidateQueries({ queryKey: ["nearby"] });
    },
  });

  const openChat = async (target: NearbyUser, invite?: boolean) => {
    try {
      const { data, error } = await supabase.rpc("get_or_create_conversation", {
        _other_user: target.id,
      });
      if (error || !data) throw error ?? new Error("sem conversa");
      const conversationId = data as string;
      if (invite) {
        const origin = typeof window !== "undefined" ? window.location.origin : "";
        await supabase.from("messages").insert({
          conversation_id: conversationId,
          sender_id: user.id,
          content: `Bora assistir algo junto no Streaming Amigo? ${origin}/watch`,
        });
      }
      setSelected(null);
      navigate({ to: "/messages/$conversationId", params: { conversationId } });
    } catch {
      toast.error("Não foi possível abrir a conversa");
    }
  };

  const points = useMemo(() => {
    const list = nearby.data ?? [];
    const max = Math.max(radius, ...list.map((u) => u.distance_km), 1);
    return list.map((u, i) => {
      const ratio = Math.min(0.92, 0.18 + (u.distance_km / max) * 0.74);
      // espalha quem está praticamente no mesmo ponto
      const angle = ((u.bearing ?? 0) + (i % 5) * 7 - 90) * (Math.PI / 180);
      return {
        user: u,
        left: 50 + Math.cos(angle) * ratio * 46,
        top: 50 + Math.sin(angle) * ratio * 46,
      };
    });
  }, [nearby.data, radius]);

  return (
    <div className="space-y-4 pb-24">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex h-16 items-center gap-3 px-4">
          <MapPin className="h-5 w-5 text-primary" />
          <div className="min-w-0 flex-1">
            <h1 className="text-[17px] font-semibold leading-tight">Por perto</h1>
            <p className="truncate text-[11px] text-muted-foreground">
              Descubra perfis na sua região e chame para conversar
            </p>
          </div>
        </div>
      </header>

      {!myLocation.data ? (
        <section className="mx-4 space-y-4 rounded-[26px] border border-primary/25 bg-[radial-gradient(circle_at_50%_0%,rgba(215,255,58,0.14),transparent_45%),var(--surface)] p-6 text-center">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-[0_0_22px_var(--primary)]">
            <Compass className="h-7 w-7" />
          </div>
          <h2 className="text-lg font-semibold">Veja quem está por perto</h2>
          <p className="text-sm text-muted-foreground">
            Sua posição é arredondada (cerca de 1 km) e ninguém vê seu endereço — só a distância
            aproximada. Você pode sair do mapa quando quiser.
          </p>
          <button
            type="button"
            onClick={() => share.mutate()}
            disabled={share.isPending}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {share.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
            Entrar no mapa
          </button>
        </section>
      ) : (
        <>
          <div className="flex items-center gap-2 overflow-x-auto px-4 scrollbar-none">
            {RADIUS_OPTIONS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRadius(r)}
                className={
                  "shrink-0 rounded-full px-4 py-2 text-[12px] font-semibold transition " +
                  (radius === r
                    ? "bg-primary text-primary-foreground"
                    : "bg-[color:var(--surface-2)] text-muted-foreground")
                }
              >
                {r} km
              </button>
            ))}
            <button
              type="button"
              onClick={() => stopSharing.mutate()}
              className="ml-auto flex shrink-0 items-center gap-1.5 rounded-full bg-[color:var(--surface-2)] px-4 py-2 text-[12px] font-semibold text-muted-foreground"
            >
              <EyeOff className="h-3.5 w-3.5" /> Sair do mapa
            </button>
          </div>

          {/* Radar */}
          <div className="px-4">
            <div className="relative aspect-square w-full overflow-hidden rounded-[28px] border border-primary/20 bg-[radial-gradient(circle_at_50%_50%,rgba(215,255,58,0.10),transparent_60%),var(--surface)]">
              {[0.92, 0.66, 0.4].map((s) => (
                <span
                  key={s}
                  className="absolute left-1/2 top-1/2 rounded-full border border-primary/15"
                  style={{
                    width: `${s * 100}%`,
                    height: `${s * 100}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                />
              ))}
              <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary shadow-[0_0_18px_var(--primary)]" />
              <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-primary/60" />

              {points.map(({ user: u, left, top }) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelected(u)}
                  className="absolute -translate-x-1/2 -translate-y-1/2"
                  style={{ left: `${left}%`, top: `${top}%` }}
                >
                  <span className="relative block">
                    <UserAvatar
                      avatarPath={u.avatar_url}
                      displayName={u.display_name ?? u.username}
                      className="h-11 w-11 ring-2 ring-background"
                    />
                    {online[u.id] ? (
                      <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-background bg-primary" />
                    ) : null}
                  </span>
                </button>
              ))}

              {nearby.isLoading ? (
                <div className="absolute inset-0 grid place-items-center">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : null}
              {!nearby.isLoading && points.length === 0 ? (
                <div className="absolute inset-x-6 bottom-6 rounded-2xl bg-[color:var(--surface-2)] p-4 text-center text-xs text-muted-foreground">
                  Ninguém por perto ainda nesse raio. Aumente a distância ou volte mais tarde.
                </div>
              ) : null}
            </div>
          </div>

          {/* Lista */}
          <ul className="space-y-2 px-4">
            {(nearby.data ?? []).map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  onClick={() => setSelected(u)}
                  className="flex w-full items-center gap-3 rounded-[20px] bg-[color:var(--surface)] p-3 text-left"
                >
                  <UserAvatar
                    avatarPath={u.avatar_url}
                    displayName={u.display_name ?? u.username}
                    className="h-11 w-11"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      <VerifiedName
                        name={u.display_name ?? u.username}
                        verified={!!u.is_verified}
                        badgeVariant={u.badge_variant as never}
                      />
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {formatDistance(u.distance_km)}
                      {u.city ? ` · ${u.city}` : ""}
                      {online[u.id] ? " · online" : ""}
                    </div>
                  </div>
                  <MessageCircle className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-xs rounded-[24px]">
          <DialogHeader>
            <DialogTitle className="text-center text-base">
              {selected?.display_name ?? selected?.username}
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4">
            {selected ? (
              <>
                <UserAvatar
                  avatarPath={selected.avatar_url}
                  displayName={selected.display_name ?? selected.username}
                  className="h-20 w-20"
                  ring
                />
                <p className="text-center text-xs text-muted-foreground">
                  {formatDistance(selected.distance_km)} de você
                  {selected.city ? ` · ${selected.city}` : ""}
                </p>
              </>
            ) : null}
            <div className="grid w-full gap-2">
              <button
                type="button"
                onClick={() => selected && openChat(selected)}
                className="flex items-center justify-center gap-2 rounded-full bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
              >
                <MessageCircle className="h-4 w-4" /> Conversar
              </button>
              <button
                type="button"
                onClick={() => selected && openChat(selected, true)}
                className="flex items-center justify-center gap-2 rounded-full bg-[color:var(--surface-2)] px-4 py-3 text-sm font-semibold"
              >
                <Tv className="h-4 w-4" /> Convidar para assistir
              </button>
              <Link
                to="/u/$username"
                params={{ username: selected?.username ?? "" }}
                onClick={() => setSelected(null)}
                className="flex items-center justify-center gap-2 rounded-full bg-[color:var(--surface-2)] px-4 py-3 text-sm font-semibold"
              >
                <UserIcon className="h-4 w-4" /> Ver perfil
              </Link>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function formatDistance(km: number) {
  if (km < 1) return "menos de 1 km";
  return `${Math.round(km)} km`;
}
