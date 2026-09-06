import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Copy,
  MessageCircle,
  Mic,
  Send,
  Star,
  Trash2,
  Tv,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { cn } from "@/lib/utils";
import {
  deleteReality,
  ensureVoiceChannel,
  featureReality,
  fetchReality,
  realityInviteLink,
  updateReality,
} from "@/lib/reality/api";
import { PRIVACY_OPTIONS, styleEmoji, type RealityPrivacy } from "@/lib/reality/catalog";

export const Route = createFileRoute("/_authenticated/reality/$id")({
  component: RealityRoom,
  head: () => ({
    meta: [
      { title: "Entre na minha realidade · Vibely Reality" },
      { name: "description", content: "Uma realidade criada no Vibely: entre, converse e assista junto." },
      { property: "og:title", content: "Entre na minha realidade · Vibely Reality" },
      { property: "og:description", content: "Uma realidade criada no Vibely: entre, converse e assista junto." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const db = supabase as unknown as { from: (t: string) => any; rpc: (fn: string, args?: any) => Promise<any> };

type Profile = {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
};

function RealityRoom() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [text, setText] = useState("");
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  const realityQuery = useQuery({
    queryKey: ["reality", id],
    queryFn: () => fetchReality(id),
    retry: false,
  });
  const reality = realityQuery.data ?? null;
  const roomId = reality?.room_id ?? null;
  const isOwner = reality?.creator_id === user.id;

  const { data: imageUrl } = useSignedUrl("realities", reality?.generated_image);

  // Entra na sala (reutiliza os membros do Streaming Amigo)
  useEffect(() => {
    if (!roomId) return;
    void db.rpc("join_watch_room", { _room: roomId }).then(({ error }: any) => {
      if (!error) void queryClient.invalidateQueries({ queryKey: ["reality-members", roomId] });
    });
  }, [roomId, queryClient]);

  const membersQuery = useQuery({
    queryKey: ["reality-members", roomId],
    enabled: !!roomId,
    queryFn: async () => {
      const { data } = await db
        .from("watch_room_members")
        .select("user_id")
        .eq("room_id", roomId)
        .is("left_at", null);
      const ids = ((data ?? []) as { user_id: string }[]).map((m) => m.user_id);
      if (!ids.length) return [] as Profile[];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      return (profiles ?? []) as Profile[];
    },
  });

  const messagesQuery = useQuery({
    queryKey: ["reality-messages", roomId],
    enabled: !!roomId,
    queryFn: async () => {
      const { data } = await db
        .from("watch_room_messages")
        .select("id, sender_id, content, created_at")
        .eq("room_id", roomId)
        .order("created_at", { ascending: true })
        .limit(120);
      const rows = (data ?? []) as { id: string; sender_id: string; content: string; created_at: string }[];
      const ids = Array.from(new Set(rows.map((r) => r.sender_id)));
      if (!ids.length) return [];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .in("id", ids);
      const map = new Map((profiles ?? []).map((p) => [p.id, p as Profile]));
      return rows.map((r) => ({ ...r, profile: map.get(r.sender_id) }));
    },
  });

  useEffect(() => {
    if (!roomId) return;
    const ch = supabase
      .channel(`reality-${roomId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watch_room_messages", filter: `room_id=eq.${roomId}` },
        () => queryClient.invalidateQueries({ queryKey: ["reality-messages", roomId] }),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "watch_room_members", filter: `room_id=eq.${roomId}` },
        () => queryClient.invalidateQueries({ queryKey: ["reality-members", roomId] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [roomId, queryClient]);

  useEffect(() => {
    if (chatOpen) listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [chatOpen, messagesQuery.data]);

  const send = useMutation({
    mutationFn: async () => {
      const content = text.trim();
      if (!content || !roomId) return;
      const { error } = await db
        .from("watch_room_messages")
        .insert({ room_id: roomId, sender_id: user.id, content });
      if (error) throw error;
    },
    onSuccess: () => setText(""),
    onError: () => toast.error("Não foi possível enviar a mensagem."),
  });

  async function openVoice() {
    if (!reality) return;
    try {
      const channelId = await ensureVoiceChannel(reality, user.id);
      void navigate({ to: "/voice/$id", params: { id: channelId } });
    } catch {
      toast.error("Não foi possível abrir a sala de voz.");
    }
  }

  async function invite() {
    const link = realityInviteLink(id);
    const message = `Entre na minha realidade no Vibely: ${link}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: reality?.name ?? "Vibely Reality", text: message, url: link });
        return;
      }
      await navigator.clipboard.writeText(link);
      toast.success("Link copiado. Compartilhe sua realidade.");
    } catch {
      /* usuário cancelou */
    }
  }

  if (realityQuery.isLoading) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-4">
        <Skeleton className="h-72 w-full rounded-3xl" />
      </div>
    );
  }

  if (!reality) {
    return (
      <div className="mx-auto w-full max-w-2xl px-4 pt-10 text-center">
        <p className="text-[15px] font-semibold">Esta realidade não está disponível.</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Ela pode ter sido removida ou ser privada.
        </p>
        <Button className="mt-4 rounded-2xl" onClick={() => void navigate({ to: "/reality" })}>
          Voltar para o Vibely Reality
        </Button>
      </div>
    );
  }

  const people = membersQuery.data?.length ?? 0;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 pb-28 pt-4">
      <header className="flex items-center gap-2">
        <Button variant="ghost" size="icon" className="rounded-full" onClick={() => history.back()}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-lg font-semibold">
            {styleEmoji(reality.style)} {reality.name}
          </h1>
          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" /> {people} {people === 1 ? "pessoa" : "pessoas"}
          </p>
        </div>
      </header>

      <div className="mt-3 overflow-hidden rounded-3xl border border-border/60 bg-[color:var(--surface)] animate-in fade-in duration-300">
        {imageUrl ? (
          <img src={imageUrl} alt={reality.name} className="w-full object-cover" loading="eager" />
        ) : (
          <Skeleton className="aspect-[4/5] w-full" />
        )}
      </div>
      {reality.description ? (
        <p className="mt-2 text-sm text-muted-foreground">{reality.description}</p>
      ) : null}

      <div className="mt-3 grid grid-cols-4 gap-2">
        <ActionButton icon={<Mic className="h-5 w-5" />} label="Voz" onClick={() => void openVoice()} />
        <ActionButton
          icon={<MessageCircle className="h-5 w-5" />}
          label="Chat"
          active={chatOpen}
          onClick={() => setChatOpen((v) => !v)}
        />
        <ActionButton
          icon={<Tv className="h-5 w-5" />}
          label="Assistir"
          onClick={() =>
            roomId
              ? void navigate({ to: "/watch/$roomId", params: { roomId } })
              : toast.error("Sala indisponível.")
          }
        />
        <ActionButton icon={<UserPlus className="h-5 w-5" />} label="Convidar" onClick={() => void invite()} />
      </div>

      <section className="mt-4 rounded-3xl border border-border/60 bg-[color:var(--surface)] p-4">
        <p className="text-sm font-semibold">Dentro da realidade</p>
        <div className="mt-3 space-y-2">
          {membersQuery.isLoading ? (
            <Skeleton className="h-10 rounded-xl" />
          ) : people === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém aqui ainda. Convide alguém.</p>
          ) : (
            membersQuery.data!.map((p) => (
              <div key={p.id} className="flex items-center gap-3">
                <span className="h-2 w-2 rounded-full bg-primary" />
                <UserAvatar avatarPath={p.avatar_url} displayName={p.display_name} className="h-8 w-8" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.display_name}</span>
                <span className="truncate text-xs text-muted-foreground">@{p.username}</span>
              </div>
            ))
          )}
        </div>
      </section>

      {chatOpen ? (
        <section className="mt-4 rounded-3xl border border-border/60 bg-[color:var(--surface)] p-4 animate-in fade-in slide-in-from-bottom-2">
          <div ref={listRef} className="max-h-64 space-y-2 overflow-y-auto pr-1">
            {(messagesQuery.data ?? []).length === 0 ? (
              <p className="text-sm text-muted-foreground">Comece a conversa dentro da sua realidade.</p>
            ) : (
              messagesQuery.data!.map((m: any) => (
                <p key={m.id} className="text-sm">
                  <span className="font-semibold">{m.profile?.display_name ?? "alguém"}:</span>{" "}
                  <span className="text-muted-foreground">{m.content}</span>
                </p>
              ))
            )}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              send.mutate();
            }}
          >
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={500}
              placeholder="Mensagem"
              className="h-11 rounded-xl"
            />
            <Button type="submit" size="icon" className="h-11 w-11 rounded-xl" disabled={!text.trim()}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </section>
      ) : null}

      {isOwner ? (
        <section className="mt-4 rounded-3xl border border-border/60 bg-[color:var(--surface)] p-4">
          <p className="text-sm font-semibold">Gerenciar realidade</p>

          <div className="mt-3 flex flex-wrap gap-2">
            {editing ? (
              <form
                className="flex w-full gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  await updateReality(id, { name: nameDraft.trim() || reality.name });
                  setEditing(false);
                  void queryClient.invalidateQueries({ queryKey: ["reality", id] });
                }}
              >
                <Input
                  value={nameDraft}
                  onChange={(e) => setNameDraft(e.target.value)}
                  maxLength={60}
                  className="h-10 rounded-xl"
                />
                <Button type="submit" className="h-10 rounded-xl">
                  Salvar
                </Button>
              </form>
            ) : (
              <Button
                variant="secondary"
                className="h-10 rounded-xl"
                onClick={() => {
                  setNameDraft(reality.name);
                  setEditing(true);
                }}
              >
                Editar nome
              </Button>
            )}
            <Button
              variant="secondary"
              className="h-10 rounded-xl"
              onClick={async () => {
                await featureReality(user.id, id);
                void queryClient.invalidateQueries({ queryKey: ["reality", id] });
                toast.success("Realidade em destaque no seu perfil.");
              }}
            >
              <Star className="mr-2 h-4 w-4" /> {reality.is_featured ? "Em destaque" : "Destacar no perfil"}
            </Button>
            <Button
              variant="secondary"
              className="h-10 rounded-xl"
              onClick={async () => {
                const link = realityInviteLink(id);
                await navigator.clipboard.writeText(link);
                toast.success("Link copiado.");
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copiar link
            </Button>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {PRIVACY_OPTIONS.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={async () => {
                  await updateReality(id, { privacy: o.id as RealityPrivacy });
                  void queryClient.invalidateQueries({ queryKey: ["reality", id] });
                }}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium",
                  reality.privacy === o.id
                    ? "bg-primary/15 text-primary"
                    : "bg-[color:var(--surface-2)] text-muted-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>

          <Button
            variant="ghost"
            className="mt-3 h-10 rounded-xl text-destructive"
            onClick={async () => {
              if (!confirm("Excluir esta realidade?")) return;
              await deleteReality(id);
              toast.success("Realidade excluída.");
              void navigate({ to: "/reality", replace: true });
            }}
          >
            <Trash2 className="mr-2 h-4 w-4" /> Excluir realidade
          </Button>
        </section>
      ) : null}
    </div>
  );
}

function ActionButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-center gap-1 rounded-2xl border border-border/60 px-2 py-3 text-xs font-medium transition-transform active:scale-[0.97]",
        active ? "border-primary/40 bg-primary/10 text-primary" : "bg-[color:var(--surface)] text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
