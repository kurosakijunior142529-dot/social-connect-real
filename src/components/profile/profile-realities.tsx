import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Plus, Sparkles } from "lucide-react";
import { useSignedUrl } from "@/hooks/use-signed-url";
import { fetchMyRealities, type Reality } from "@/lib/reality/api";
import { styleEmoji } from "@/lib/reality/catalog";

function Thumb({ path }: { path: string }) {
  const { data: url } = useSignedUrl("realities", path);
  return url ? (
    <img src={url} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
  ) : (
    <div className="h-full w-full animate-pulse bg-[color:var(--surface-2)]" />
  );
}

/** Seção opcional "Minhas Realidades" no perfil. */
export function ProfileRealities({ profileId, isMe }: { profileId: string; isMe: boolean }) {
  const { data, isLoading } = useQuery({
    queryKey: ["realities", "profile", profileId],
    queryFn: () => fetchMyRealities(profileId),
  });

  const realities = (data ?? []) as Reality[];
  if (!realities.length && !isMe) return null;

  const sorted = [...realities].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase text-primary">Momentos transformados</p>
          <h2 className="text-xl font-bold">Minhas Realidades</h2>
        </div>
        {isMe ? (
          <Link to="/reality/new" className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/5 px-3 text-xs font-semibold text-primary transition hover:bg-primary/10">
            <Plus className="h-3.5 w-3.5" /> Criar
          </Link>
        ) : null}
      </div>
      {isLoading ? (
        <div className="flex gap-3 overflow-hidden"><div className="aspect-[4/5] w-36 shrink-0 animate-pulse rounded-xl bg-[color:var(--surface-2)]" /><div className="aspect-[4/5] w-36 shrink-0 animate-pulse rounded-xl bg-[color:var(--surface-2)]" /></div>
      ) : sorted.length === 0 ? (
        <Link to="/reality/new" className="group grid min-h-36 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-4 overflow-hidden rounded-xl border border-primary/20 bg-[color:var(--surface)] p-4 transition hover:border-primary/40 hover:bg-primary/5">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary"><Sparkles className="h-5 w-5" /></span>
          <span className="min-w-0"><strong className="block text-sm font-bold">Crie sua primeira Realidade</strong><span className="mt-1 block text-xs leading-relaxed text-muted-foreground">Compartilhe um momento que representa você.</span></span>
          <ArrowRight className="h-5 w-5 shrink-0 text-primary transition-transform group-hover:translate-x-0.5" />
        </Link>
      ) : (
        <div className="no-scrollbar flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2">
          {sorted.map((r) => (
            <Link
              key={r.id}
              to="/reality/$id"
              params={{ id: r.id }}
              className="group w-36 shrink-0 snap-start overflow-hidden rounded-xl border border-border/70 bg-[color:var(--surface)] shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-primary/25"
            >
              <div className="aspect-[4/5]">
                <Thumb path={r.generated_image} />
              </div>
              <p className="truncate px-3 py-2.5 text-xs font-semibold">
                {r.is_featured ? "⭐ " : ""}
                {styleEmoji(r.style)} {r.name}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
