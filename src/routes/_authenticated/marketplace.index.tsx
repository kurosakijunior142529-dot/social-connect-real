import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Store, Plus, Search, Bookmark, MapPin } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/marketplace/")({
  component: MarketplaceIndex,
});

const FALLBACK_CATS = [
  { id: "electronics", label: "Eletrônicos", emoji: "📱" },
  { id: "fashion", label: "Moda", emoji: "👕" },
  { id: "home", label: "Casa", emoji: "🏠" },
  { id: "vehicles", label: "Veículos", emoji: "🚗" },
  { id: "sports", label: "Esportes", emoji: "⚽" },
  { id: "services", label: "Serviços", emoji: "🛠️" },
  { id: "other", label: "Outros", emoji: "✨" },
];

function MarketplaceIndex() {
  const { user } = Route.useRouteContext();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);

  const categories = useQuery({
    queryKey: ["listing-categories"],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("listing_categories")
        .select("*")
        .order("position");
      return (data ?? FALLBACK_CATS) as { id: string; label: string; emoji?: string }[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const listings = useQuery({
    queryKey: ["listings", { q, cat }],
    queryFn: async () => {
      let query = (supabase as any)
        .from("listings")
        .select("*, listing_images(storage_path, position)")
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(60);
      if (cat) query = query.eq("category_id", cat);
      if (q.trim()) query = query.ilike("title", `%${q.trim()}%`);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const savedIds = useQuery({
    queryKey: ["listing-saves", user.id],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("listing_saves")
        .select("listing_id")
        .eq("user_id", user.id);
      return new Set(((data ?? []) as any[]).map((r) => r.listing_id));
    },
  });

  return (
    <div className="pb-8">
      <header className="sticky top-0 z-20 glass-heavy hairline-b">
        <div className="flex items-center gap-2 px-4 h-12">
          <Store className="h-5 w-5" />
          <h1 className="text-[19px] font-display font-semibold tracking-tight flex-1">
            Marketplace
          </h1>
          <Link to="/marketplace/new">
            <Button size="sm" className="h-8 gap-1">
              <Plus className="h-4 w-4" /> Anunciar
            </Button>
          </Link>
        </div>
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar anúncios…"
              className="pl-9 h-10"
            />
          </div>
        </div>
        <div className="px-4 pb-2 flex gap-2 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setCat(null)}
            className={cn(
              "shrink-0 px-3 h-8 rounded-full text-xs font-medium",
              !cat ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)]",
            )}
          >
            Todos
          </button>
          {(categories.data ?? FALLBACK_CATS).map((c) => (
            <button
              key={c.id}
              onClick={() => setCat(c.id === cat ? null : c.id)}
              className={cn(
                "shrink-0 px-3 h-8 rounded-full text-xs font-medium flex items-center gap-1",
                cat === c.id ? "bg-primary text-primary-foreground" : "bg-[color:var(--surface-2)]",
              )}
            >
              <span>{c.emoji}</span>
              {c.label}
            </button>
          ))}
        </div>
      </header>

      <div className="px-3 pt-3">
        {listings.isLoading ? (
          <p className="text-sm text-muted-foreground p-4">Carregando…</p>
        ) : !listings.data?.length ? (
          <div className="text-center py-16 space-y-2">
            <p className="text-sm text-muted-foreground">Nenhum anúncio encontrado.</p>
            <Link to="/marketplace/new">
              <Button size="sm" variant="secondary">
                Publicar o primeiro
              </Button>
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {listings.data.map((l) => (
              <ListingCard key={l.id} listing={l} saved={savedIds.data?.has(l.id) ?? false} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ListingCard({ listing, saved }: { listing: any; saved: boolean }) {
  const cover = useMemo(() => {
    const imgs = (listing.listing_images ?? []).slice().sort((a: any, b: any) => a.position - b.position);
    return imgs[0]?.storage_path ?? null;
  }, [listing.listing_images]);
  const url = useMarketplaceSigned(cover);
  const price = (listing.price_cents ?? 0) / 100;
  return (
    <Link
      to="/marketplace/$id"
      params={{ id: listing.id }}
      className="block rounded-2xl overflow-hidden bg-[color:var(--surface)] hover:bg-[color:var(--surface-2)] transition"
    >
      <div className="aspect-square bg-black/40 relative">
        {url ? (
          <img src={url} alt={listing.title} className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="h-full w-full grid place-items-center text-muted-foreground text-xs">
            sem foto
          </div>
        )}
        {saved ? (
          <div className="absolute top-2 right-2 h-7 w-7 rounded-full bg-black/60 grid place-items-center">
            <Bookmark className="h-4 w-4 fill-white text-white" />
          </div>
        ) : null}
      </div>
      <div className="p-2.5 space-y-0.5">
        <div className="text-[13px] font-semibold truncate">{listing.title}</div>
        <div className="text-[14px] font-bold text-primary">
          {price.toLocaleString("pt-BR", { style: "currency", currency: listing.currency || "BRL" })}
        </div>
        {listing.city ? (
          <div className="text-[11px] text-muted-foreground flex items-center gap-0.5">
            <MapPin className="h-3 w-3" /> {listing.city}
          </div>
        ) : null}
      </div>
    </Link>
  );
}

function useMarketplaceSigned(path: string | null) {
  return useQuery({
    queryKey: ["marketplace-signed", path ?? ""],
    queryFn: async () => {
      if (!path) return null;
      const { data } = await supabase.storage.from("marketplace").createSignedUrl(path, 60 * 60);
      return data?.signedUrl ?? null;
    },
    enabled: !!path,
    staleTime: 30 * 60 * 1000,
  }).data;
}
