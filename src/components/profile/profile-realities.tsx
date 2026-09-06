import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
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
  const { data } = useQuery({
    queryKey: ["realities", "profile", profileId],
    queryFn: () => fetchMyRealities(profileId),
  });

  const realities = (data ?? []) as Reality[];
  if (!realities.length && !isMe) return null;

  const sorted = [...realities].sort((a, b) => Number(b.is_featured) - Number(a.is_featured));

  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold">Minhas Realidades</h2>
        {isMe ? (
          <Link to="/reality/new" className="text-xs font-medium text-primary">
            <Plus className="mr-1 inline h-3.5 w-3.5" />
            Criar
          </Link>
        ) : null}
      </div>
      {sorted.length === 0 ? (
        <p className="rounded-2xl border border-border/60 bg-[color:var(--surface)] p-4 text-sm text-muted-foreground">
          Você ainda não criou uma realidade.
        </p>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {sorted.map((r) => (
            <Link
              key={r.id}
              to="/reality/$id"
              params={{ id: r.id }}
              className="w-32 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-[color:var(--surface)]"
            >
              <div className="aspect-[4/5]">
                <Thumb path={r.generated_image} />
              </div>
              <p className="truncate px-2 py-2 text-xs font-medium">
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
