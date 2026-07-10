import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Heart, Bookmark, MessageCircle, MapPin, Trash2, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/marketplace/$id")({
  component: ListingDetail,
});

function ListingDetail() {
  const { id } = Route.useParams();
  const { user } = Route.useRouteContext();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [activeImg, setActiveImg] = useState(0);
  const [signedImgs, setSignedImgs] = useState<string[]>([]);
  const [contacting, setContacting] = useState(false);

  const listing = useQuery({
    queryKey: ["listing", id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("listings")
        .select("*, listing_images(storage_path, position)")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const { data: seller } = await supabase
        .from("profiles")
        .select("id, username, display_name, avatar_url")
        .eq("id", data.seller_id)
        .maybeSingle();
      return { ...data, seller };
    },
  });

  const likes = useQuery({
    queryKey: ["listing-likes", id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("listing_likes")
        .select("user_id")
        .eq("listing_id", id);
      const arr = (data ?? []) as { user_id: string }[];
      return { count: arr.length, mine: arr.some((r) => r.user_id === user.id) };
    },
  });

  const saved = useQuery({
    queryKey: ["listing-saved", id, user.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("listing_saves")
        .select("user_id")
        .eq("listing_id", id)
        .eq("user_id", user.id)
        .maybeSingle();
      return !!data;
    },
  });

  useEffect(() => {
    const imgs = (listing.data?.listing_images ?? []).slice().sort((a: any, b: any) => a.position - b.position);
    if (!imgs.length) return setSignedImgs([]);
    (async () => {
      const results = await Promise.all(
        imgs.map(async (i: any) => {
          const { data } = await supabase.storage
            .from("marketplace")
            .createSignedUrl(i.storage_path, 60 * 60);
          return data?.signedUrl ?? "";
        }),
      );
      setSignedImgs(results.filter(Boolean));
    })();
  }, [listing.data?.listing_images]);

  const isOwner = listing.data?.seller_id === user.id;

  async function toggleLike() {
    if (!likes.data) return;
    if (likes.data.mine) {
      await (supabase as any)
        .from("listing_likes")
        .delete()
        .eq("listing_id", id)
        .eq("user_id", user.id);
    } else {
      await (supabase as any).from("listing_likes").insert({ listing_id: id, user_id: user.id });
    }
    qc.invalidateQueries({ queryKey: ["listing-likes", id] });
  }

  async function toggleSave() {
    if (saved.data) {
      await (supabase as any)
        .from("listing_saves")
        .delete()
        .eq("listing_id", id)
        .eq("user_id", user.id);
    } else {
      await (supabase as any).from("listing_saves").insert({ listing_id: id, user_id: user.id });
    }
    qc.invalidateQueries({ queryKey: ["listing-saved", id, user.id] });
  }

  async function contactSeller() {
    if (!listing.data?.seller_id || isOwner) return;
    setContacting(true);
    const { data, error } = await (supabase as any).rpc("get_or_create_conversation", {
      _other_user: listing.data.seller_id,
    });
    setContacting(false);
    if (error || !data) return toast.error(error?.message ?? "Falha ao abrir conversa");
    // Pre-fill a message about the listing
    await (supabase as any).from("messages").insert({
      conversation_id: data,
      sender_id: user.id,
      kind: "text",
      content: `Olá! Tenho interesse no seu anúncio: "${listing.data.title}"`,
    });
    navigate({ to: "/messages/$conversationId", params: { conversationId: data } });
  }

  async function del() {
    if (!confirm("Excluir este anúncio?")) return;
    const { error } = await (supabase as any).from("listings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Anúncio excluído");
    navigate({ to: "/marketplace" });
  }

  async function share() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (navigator.share) {
      try {
        await navigator.share({ title: listing.data?.title, url });
      } catch { /* user cancelled */ }
    } else {
      await navigator.clipboard.writeText(url);
      toast.success("Link copiado");
    }
  }

  if (listing.isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando…</div>;
  if (!listing.data) return <div className="p-6 text-sm text-muted-foreground">Anúncio não encontrado.</div>;

  const price = (listing.data.price_cents ?? 0) / 100;

  return (
    <div className="pb-24">
      <header className="sticky top-0 z-20 glass-heavy hairline-b flex items-center gap-2 px-3 h-12">
        <Link
          to="/marketplace"
          className="p-2 -ml-1 rounded-full active:bg-[color:var(--surface-2)]"
          aria-label="Voltar"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-[15px] font-semibold flex-1 truncate">{listing.data.title}</h1>
        <button onClick={share} className="p-2 rounded-full active:bg-[color:var(--surface-2)]" aria-label="Compartilhar">
          <Share2 className="h-4 w-4" />
        </button>
      </header>

      <div className="relative bg-black">
        {signedImgs.length ? (
          <>
            <img
              src={signedImgs[activeImg]}
              alt={listing.data.title}
              className="w-full aspect-square object-contain"
            />
            {signedImgs.length > 1 ? (
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
                {signedImgs.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveImg(i)}
                    className={cn(
                      "h-1.5 w-6 rounded-full transition",
                      i === activeImg ? "bg-white" : "bg-white/40",
                    )}
                  />
                ))}
              </div>
            ) : null}
          </>
        ) : (
          <div className="w-full aspect-square grid place-items-center text-muted-foreground text-sm">
            sem foto
          </div>
        )}
      </div>

      <div className="p-4 space-y-3">
        <div>
          <div className="text-[26px] font-bold text-primary">
            {price.toLocaleString("pt-BR", {
              style: "currency",
              currency: listing.data.currency || "BRL",
            })}
          </div>
          <div className="text-lg font-semibold">{listing.data.title}</div>
          <div className="text-[12px] text-muted-foreground flex items-center gap-2 flex-wrap">
            {listing.data.city ? (
              <span className="flex items-center gap-0.5">
                <MapPin className="h-3 w-3" /> {listing.data.city}
              </span>
            ) : null}
            <span>·</span>
            <span>{listing.data.condition === "new" ? "Novo" : listing.data.condition === "refurbished" ? "Recondicionado" : "Usado"}</span>
            <span>·</span>
            <span>
              {formatDistanceToNowStrict(new Date(listing.data.created_at), { locale: ptBR, addSuffix: true })}
            </span>
          </div>
        </div>

        {listing.data.description ? (
          <p className="text-[14px] whitespace-pre-wrap leading-relaxed">{listing.data.description}</p>
        ) : null}

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={toggleLike}
            className="flex items-center gap-1 text-sm px-3 h-9 rounded-full bg-[color:var(--surface-2)]"
          >
            <Heart className={cn("h-4 w-4", likes.data?.mine && "fill-red-500 text-red-500")} />
            {likes.data?.count ?? 0}
          </button>
          <button
            onClick={toggleSave}
            className="flex items-center gap-1 text-sm px-3 h-9 rounded-full bg-[color:var(--surface-2)]"
          >
            <Bookmark className={cn("h-4 w-4", saved.data && "fill-current")} />
            {saved.data ? "Salvo" : "Salvar"}
          </button>
        </div>

        {listing.data.seller ? (
          <Link
            to="/u/$username"
            params={{ username: listing.data.seller.username }}
            className="flex items-center gap-3 p-3 rounded-2xl bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)] transition"
          >
            <UserAvatar
              avatarPath={listing.data.seller.avatar_url}
              displayName={listing.data.seller.display_name}
              className="h-10 w-10"
            />
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm truncate">{listing.data.seller.display_name}</div>
              <div className="text-[12px] text-muted-foreground">@{listing.data.seller.username}</div>
            </div>
          </Link>
        ) : null}
      </div>

      <div className="fixed bottom-0 left-0 right-0 md:left-60 pb-[env(safe-area-inset-bottom)] p-3 bg-background hairline-t z-10">
        <div className="mx-auto max-w-2xl md:px-4 flex gap-2">
          {isOwner ? (
            <Button variant="destructive" onClick={del} className="w-full">
              <Trash2 className="h-4 w-4 mr-1" /> Excluir anúncio
            </Button>
          ) : (
            <Button onClick={contactSeller} disabled={contacting} className="w-full">
              <MessageCircle className="h-4 w-4 mr-1" /> Contatar vendedor
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
