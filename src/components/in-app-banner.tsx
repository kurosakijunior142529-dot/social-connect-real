import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

type Banner = { id: string; conversationId: string; name: string; avatar: string | null; text: string };

const KIND_LABEL: Record<string, string> = {
  audio: "🎙️ Áudio",
  image: "📷 Foto",
  video: "🎬 Vídeo",
  file: "📎 Arquivo",
  location: "📍 Localização",
  call: "📞 Chamada",
  post: "Compartilhou uma publicação",
  gif: "GIF",
  sticker: "Figurinha",
};

/** Pílula discreta no topo quando chega mensagem fora da conversa aberta. */
export function InAppBanner({ userId }: { userId?: string }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const pathRef = useRef(pathname);
  pathRef.current = pathname;
  const [banner, setBanner] = useState<Banner | null>(null);
  const [shown, setShown] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startY = useRef<number | null>(null);

  const hide = () => {
    setShown(false);
    clearTimeout(timer.current);
    setTimeout(() => setBanner(null), 300);
  };

  useEffect(() => {
    if (!userId) return;
    const ch = supabase
      .channel(`banner-${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload: any) => {
        const m = payload.new;
        if (!m || m.sender_id === userId) return;
        if (pathRef.current === `/messages/${m.conversation_id}`) return;
        const { data: mute } = await supabase
          .from("muted_conversations")
          .select("until")
          .eq("user_id", userId)
          .eq("conversation_id", m.conversation_id)
          .maybeSingle();
        if (mute && (!mute.until || new Date(mute.until).getTime() > Date.now())) return;
        const { data: p } = await supabase
          .from("profiles")
          .select("display_name, username, avatar_url")
          .eq("id", m.sender_id)
          .maybeSingle();
        const text = m.kind === "text" || !m.kind ? (m.content ?? "") : (KIND_LABEL[m.kind] ?? "Nova mensagem");
        setBanner({
          id: m.id,
          conversationId: m.conversation_id,
          name: p?.display_name || p?.username || "Nova mensagem",
          avatar: p?.avatar_url ?? null,
          text: text.slice(0, 90),
        });
        requestAnimationFrame(() => setShown(true));
        try { navigator.vibrate?.(10); } catch { /* noop */ }
        clearTimeout(timer.current);
        timer.current = setTimeout(hide, 3500);
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
      clearTimeout(timer.current);
    };
  }, [userId]);

  if (!banner) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-3 pt-[calc(env(safe-area-inset-top)+8px)]">
      <button
        type="button"
        onClick={() => { hide(); navigate({ to: "/messages/$conversationId", params: { conversationId: banner.conversationId } }); }}
        onTouchStart={(e) => (startY.current = e.touches[0].clientY)}
        onTouchMove={(e) => { if (startY.current !== null && e.touches[0].clientY - startY.current < -20) { startY.current = null; hide(); } }}
        className={cn(
          "pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-full border border-[color:var(--hairline)] bg-popover/90 py-2 pl-2 pr-4 text-left shadow-2xl backdrop-blur-xl transition-all duration-300 ease-[cubic-bezier(.22,1,.36,1)]",
          shown ? "translate-y-0 opacity-100" : "-translate-y-6 opacity-0",
        )}
      >
        {banner.avatar ? (
          <img src={banner.avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-sm font-semibold">
            {banner.name.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-foreground">{banner.name}</span>
          <span className="block truncate text-[12px] text-muted-foreground">{banner.text}</span>
        </span>
        <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
      </button>
    </div>
  );
}
