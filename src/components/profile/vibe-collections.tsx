import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { SignedMediaThumb } from "@/components/signed-image";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";
import { Check, Pin, Plus, Sparkles, Star, Trash2, X, Pencil } from "lucide-react";

type Collection = {
  id: string;
  user_id: string;
  title: string;
  accent: string;
  cover_bucket: string;
  cover_path: string | null;
  is_pinned: boolean;
  position: number;
  view_count: number;
};

type Item = {
  id: string;
  collection_id: string;
  bucket: string;
  media_path: string;
  media_type: string;
  caption: string | null;
  position: number;
};

const ACCENTS = ["#22E06A", "#3BC9F5", "#F5C542", "#FF6B9A", "#A46BFF", "#FF8A3D"];

/** Formato "gema": hexágono suave usado nas capas das Coleções. */
const GEM_CLIP = "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)";

export function VibeCollections({
  profileId,
  isMe,
  activeVibes,
}: {
  profileId: string;
  isMe: boolean;
  activeVibes: any[];
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Collection | "new" | null>(null);
  const [playing, setPlaying] = useState<Collection | null>(null);

  const collections = useQuery({
    queryKey: ["vibe-collections", profileId],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vibe_collections")
        .select("*")
        .eq("user_id", profileId)
        .order("is_pinned", { ascending: false })
        .order("position", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Collection[];
    },
  });

  const counts = useQuery({
    queryKey: ["vibe-collection-counts", profileId],
    enabled: (collections.data?.length ?? 0) > 0,
    queryFn: async () => {
      const ids = (collections.data ?? []).map((c) => c.id);
      const { data } = await (supabase as any)
        .from("vibe_collection_items")
        .select("collection_id")
        .in("collection_id", ids);
      const map: Record<string, number> = {};
      for (const row of (data ?? []) as { collection_id: string }[]) {
        map[row.collection_id] = (map[row.collection_id] ?? 0) + 1;
      }
      return map;
    },
  });

  const list = collections.data ?? [];
  if (!isMe && list.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-primary">Permanentes</p>
          <h2 className="text-xl font-bold">Coleções de Vibes</h2>
        </div>
        {isMe ? (
          <Button variant="outline" size="sm" className="gap-2" onClick={() => setEditing("new")}>
            <Plus className="h-4 w-4" /> Nova coleção
          </Button>
        ) : null}
      </div>

      <div className="no-scrollbar flex gap-4 overflow-x-auto pb-2">
        {list.map((c, i) => (
          <CollectionCover
            key={c.id}
            index={i}
            collection={c}
            count={counts.data?.[c.id] ?? 0}
            isMe={isMe}
            onOpen={() => setPlaying(c)}
            onEdit={() => setEditing(c)}
          />
        ))}
        {list.length === 0 ? (
          <div className="flex w-full items-center justify-center rounded-xl border border-dashed border-border py-6 text-sm text-muted-foreground">
            Guarde suas melhores Vibes para sempre em uma coleção.
          </div>
        ) : null}
      </div>

      {editing ? (
        <CollectionEditor
          profileId={profileId}
          activeVibes={activeVibes}
          collection={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ["vibe-collections", profileId] });
            queryClient.invalidateQueries({ queryKey: ["vibe-collection-counts", profileId] });
            setEditing(null);
          }}
        />
      ) : null}

      {playing ? <CollectionPlayer collection={playing} isMe={isMe} onClose={() => setPlaying(null)} /> : null}
    </section>
  );
}

function CollectionCover({
  collection,
  count,
  isMe,
  index = 0,
  onOpen,
  onEdit,
}: {
  collection: Collection;
  count: number;
  isMe: boolean;
  index?: number;
  onOpen: () => void;
  onEdit: () => void;
}) {
  const size = collection.is_pinned ? 96 : 78;
  return (
    <div
      className="gem-enter relative shrink-0 text-center"
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
    >
      <button
        type="button"
        onClick={onOpen}
        className="group block"
        aria-label={`Abrir coleção ${collection.title}`}
        style={{ width: size + 10 }}
      >
        <span
          className="gem-glow relative mx-auto block transition-transform duration-300 group-hover:scale-105 group-active:scale-95"
          style={{
            width: size,
            height: size,
            clipPath: GEM_CLIP,
            background: `linear-gradient(135deg, ${collection.accent}, transparent 70%)`,
            padding: 3,
            ["--gem-accent" as any]: collection.accent,
          }}
        >
          <span className="block h-full w-full overflow-hidden bg-[color:var(--surface-2)]" style={{ clipPath: GEM_CLIP }}>
            {collection.cover_path ? (
              <SignedMediaThumb
                bucket={collection.cover_bucket as any}
                path={collection.cover_path}
                mediaType="image"
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-muted-foreground">
                <Sparkles className="h-5 w-5" />
              </span>
            )}
          </span>
        </span>
        <span className="mt-2 block truncate text-xs font-medium" style={{ maxWidth: size + 10 }}>
          {collection.title}
        </span>
        <span className="block text-[11px] text-muted-foreground">
          {count} {count === 1 ? "vibe" : "vibes"}
          {isMe && collection.view_count ? ` · ${collection.view_count} views` : ""}
        </span>
      </button>
      {collection.is_pinned ? (
        <span
          className="pointer-events-none absolute -right-0 top-0 grid h-5 w-5 place-items-center rounded-full text-background"
          style={{ background: collection.accent }}
        >
          <Star className="h-3 w-3 fill-current" />
        </span>
      ) : null}
      {isMe ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Editar coleção ${collection.title}`}
          className="absolute -left-1 top-0 grid h-6 w-6 place-items-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
        >
          <Pencil className="h-3 w-3" />
        </button>
      ) : null}
    </div>
  );
}

function CollectionEditor({
  profileId,
  activeVibes,
  collection,
  onClose,
  onSaved,
}: {
  profileId: string;
  activeVibes: any[];
  collection: Collection | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(collection?.title ?? "");
  const [accent, setAccent] = useState(collection?.accent ?? ACCENTS[0]);
  const [pinned, setPinned] = useState(collection?.is_pinned ?? false);
  const [selected, setSelected] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(collection?.cover_path ?? null);
  const [saving, setSaving] = useState(false);

  /** Todas as Vibes do dono (inclusive expiradas) + itens já salvos na coleção. */
  const source = useQuery({
    queryKey: ["vibe-source", profileId, collection?.id ?? "new"],
    queryFn: async () => {
      const [storiesRes, itemsRes] = await Promise.all([
        (supabase as any)
          .from("stories")
          .select("id, media_url, media_type, caption, created_at")
          .eq("user_id", profileId)
          .order("created_at", { ascending: false })
          .limit(120),
        collection
          ? (supabase as any).from("vibe_collection_items").select("*").eq("collection_id", collection.id).order("position")
          : Promise.resolve({ data: [] }),
      ]);
      const stories = (storiesRes.data ?? []) as any[];
      const items = (itemsRes.data ?? []) as Item[];
      // Vibes que já saíram do ar continuam disponíveis pelo caminho salvo no item.
      const known = new Set(stories.map((s) => s.media_url));
      const orphans = items
        .filter((i) => !known.has(i.media_path))
        .map((i) => ({ id: `item:${i.id}`, media_url: i.media_path, media_type: i.media_type, caption: i.caption }));
      return { options: [...stories, ...orphans], items };
    },
  });

  useEffect(() => {
    if (!source.data) return;
    if (collection) {
      setSelected(source.data.items.map((i) => i.media_path));
      setCover((c) => c ?? source.data.items[0]?.media_path ?? null);
    }
  }, [source.data, collection]);

  const options = source.data?.options ?? [];
  const optionByPath = useMemo(() => {
    const map: Record<string, any> = {};
    for (const o of options) map[o.media_url] = o;
    for (const v of activeVibes) map[v.media_url] = map[v.media_url] ?? v;
    return map;
  }, [options, activeVibes]);

  function toggle(path: string) {
    setSelected((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
    setCover((c) => c ?? path);
  }

  async function save() {
    if (title.trim().length < 2) return toast.error("Dê um nome à coleção");
    if (selected.length === 0) return toast.error("Escolha pelo menos uma Vibe");
    setSaving(true);
    try {
      let collectionId = collection?.id;
      const payload = {
        title: title.trim(),
        accent,
        is_pinned: pinned,
        cover_bucket: "stories",
        cover_path: cover ?? selected[0],
      };
      if (collectionId) {
        const { error } = await (supabase as any).from("vibe_collections").update(payload).eq("id", collectionId);
        if (error) throw error;
        await (supabase as any).from("vibe_collection_items").delete().eq("collection_id", collectionId);
      } else {
        const { data, error } = await (supabase as any)
          .from("vibe_collections")
          .insert({ ...payload, user_id: profileId })
          .select("id")
          .single();
        if (error) throw error;
        collectionId = data.id as string;
      }
      if (pinned) {
        await (supabase as any)
          .from("vibe_collections")
          .update({ is_pinned: false })
          .eq("user_id", profileId)
          .neq("id", collectionId);
      }
      const rows = selected.map((path, index) => {
        const opt = optionByPath[path];
        return {
          collection_id: collectionId,
          story_id: opt && !String(opt.id).startsWith("item:") ? opt.id : null,
          bucket: "stories",
          media_path: path,
          media_type: opt?.media_type ?? "image",
          caption: opt?.caption ?? null,
          position: index,
        };
      });
      const { error: itemsError } = await (supabase as any).from("vibe_collection_items").insert(rows);
      if (itemsError) throw itemsError;
      toast.success(collection ? "Coleção atualizada!" : "Coleção criada!");
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? "Não foi possível salvar");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!collection) return;
    const { error } = await (supabase as any).from("vibe_collections").delete().eq("id", collection.id);
    if (error) return toast.error(error.message);
    toast.success("Coleção apagada");
    onSaved();
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>{collection ? "Editar coleção" : "Nova coleção de Vibes"}</SheetTitle>
        </SheetHeader>

        <div className="space-y-5 py-4">
          <div className="space-y-2">
            <Label htmlFor="vc-title">Nome</Label>
            <Input
              id="vc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={28}
              placeholder="Viagens, Rolês, Estúdio…"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label>Cor de destaque</Label>
            <div className="flex flex-wrap gap-2">
              {ACCENTS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAccent(c)}
                  aria-label={`Cor ${c}`}
                  className="grid h-9 w-9 place-items-center rounded-full border-2"
                  style={{ background: c, borderColor: accent === c ? "var(--foreground)" : "transparent" }}
                >
                  {accent === c ? <Check className="h-4 w-4 text-black" /> : null}
                </button>
              ))}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setPinned((p) => !p)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border px-4 py-3 text-left"
          >
            <Pin className={`h-4 w-4 ${pinned ? "text-primary" : "text-muted-foreground"}`} />
            <span className="flex-1">
              <span className="block text-sm font-semibold">Coleção fixada</span>
              <span className="block text-xs text-muted-foreground">Aparece maior e primeiro no perfil</span>
            </span>
            <span className={`h-5 w-9 rounded-full p-0.5 transition ${pinned ? "bg-primary" : "bg-muted"}`}>
              <span className={`block h-4 w-4 rounded-full bg-background transition ${pinned ? "translate-x-4" : ""}`} />
            </span>
          </button>

          <div className="space-y-2">
            <Label>Vibes da coleção {selected.length ? `(${selected.length})` : ""}</Label>
            {options.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Você ainda não publicou Vibes para guardar aqui.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {options.map((o: any) => {
                  const active = selected.includes(o.media_url);
                  const order = selected.indexOf(o.media_url) + 1;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => toggle(o.media_url)}
                      className="relative aspect-[9/16] overflow-hidden rounded-xl border-2"
                      style={{ borderColor: active ? accent : "transparent" }}
                    >
                      <SignedMediaThumb
                        bucket="stories"
                        path={o.media_url}
                        mediaType={o.media_type}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                      {active ? (
                        <span
                          className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold text-black"
                          style={{ background: accent }}
                        >
                          {order}
                        </span>
                      ) : null}
                      {active ? (
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            setCover(o.media_url);
                          }}
                          className="absolute bottom-1 left-1 rounded-full bg-black/70 px-2 py-0.5 text-[10px] font-medium text-white"
                        >
                          {cover === o.media_url ? "capa" : "usar capa"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-2 pb-4">
            {collection ? (
              <Button variant="outline" className="gap-2 text-destructive" onClick={remove}>
                <Trash2 className="h-4 w-4" /> Apagar
              </Button>
            ) : null}
            <Button className="flex-1" onClick={save} disabled={saving}>
              {saving ? "Salvando…" : collection ? "Salvar alterações" : "Criar coleção"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function CollectionPlayer({
  collection,
  isMe,
  onClose,
}: {
  collection: Collection;
  isMe: boolean;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);

  const items = useQuery({
    queryKey: ["vibe-collection-items", collection.id],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vibe_collection_items")
        .select("*")
        .eq("collection_id", collection.id)
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Item[];
    },
  });

  useEffect(() => {
    if (isMe) return;
    (supabase as any)
      .from("vibe_collections")
      .update({ view_count: (collection.view_count ?? 0) + 1 })
      .eq("id", collection.id)
      .then(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collection.id]);

  const list = items.data ?? [];
  const current = list[index];
  const { data: url } = useSignedUrl("stories", current?.media_path);

  useEffect(() => {
    if (!current || current.media_type === "video") return;
    const t = window.setTimeout(() => {
      setIndex((i) => (i + 1 < list.length ? i + 1 : (onClose(), i)));
    }, 5000);
    return () => window.clearTimeout(t);
  }, [current, list.length, onClose]);

  return (
    <div className="fixed inset-0 z-[100] bg-black">
      <div className="mx-auto flex h-full max-w-md flex-col">
        <div className="flex gap-1 px-3 pt-3">
          {list.map((_, i) => (
            <span key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/25">
              <span
                className="block h-full rounded-full transition-all"
                style={{ width: i < index ? "100%" : i === index ? "100%" : "0%", background: collection.accent }}
              />
            </span>
          ))}
        </div>

        <div className="flex items-center gap-3 px-4 py-3">
          <span
            className="h-8 w-8 shrink-0"
            style={{ clipPath: GEM_CLIP, background: collection.accent }}
            aria-hidden
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-white">{collection.title}</p>
            <p className="text-[11px] text-white/60">
              {list.length ? `${index + 1} de ${list.length}` : "Carregando…"}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="relative flex-1">
          {url && current ? (
            current.media_type === "video" ? (
              <video
                key={current.id}
                src={url}
                className="h-full w-full object-contain"
                autoPlay
                playsInline
                controls={false}
                onEnded={() => (index + 1 < list.length ? setIndex(index + 1) : onClose())}
              />
            ) : (
              <img key={current.id} src={url} alt={current.caption ?? ""} className="h-full w-full object-contain" />
            )
          ) : null}

          <button
            type="button"
            aria-label="Anterior"
            className="absolute inset-y-0 left-0 w-1/3"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
          />
          <button
            type="button"
            aria-label="Próxima"
            className="absolute inset-y-0 right-0 w-1/3"
            onClick={() => (index + 1 < list.length ? setIndex(index + 1) : onClose())}
          />

          {current?.caption ? (
            <p className="absolute inset-x-4 bottom-6 rounded-2xl bg-black/50 px-4 py-2 text-center text-sm text-white backdrop-blur">
              {current.caption}
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
