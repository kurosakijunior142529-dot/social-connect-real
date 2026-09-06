import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Tv, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useGlobalPresence } from "@/lib/presence";
import { inviteLinkFor } from "@/lib/watch/rooms";

/**
 * "Momento em dupla": só aparece quando os dois estão online ao mesmo tempo.
 * Cria uma sala privada na hora e manda o convite na própria conversa.
 */
export function TogetherChip({
  currentUserId,
  otherUserId,
  otherName,
  conversationId,
}: {
  currentUserId: string;
  otherUserId: string;
  otherName: string;
  conversationId: string;
}) {
  const navigate = useNavigate();
  const { online } = useGlobalPresence(currentUserId);
  const [busy, setBusy] = useState(false);

  if (!online[otherUserId]) return null;

  async function start() {
    setBusy(true);
    try {
      const { data, error } = await (supabase as any)
        .from("watch_rooms")
        .insert({
          host_id: currentUserId,
          provider: "youtube",
          video_id: "",
          title: `Você e ${otherName}`,
          visibility: "invite",
          category: "geral",
        })
        .select("id, invite_code")
        .single();
      if (error || !data) throw error ?? new Error("Não foi possível abrir a sala.");

      await (supabase as any).from("messages").insert({
        conversation_id: conversationId,
        sender_id: currentUserId,
        content: `Bora assistir junto agora? ${inviteLinkFor(data.invite_code)}`,
      });

      void navigate({ to: "/watch/$roomId", params: { roomId: data.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível abrir a sala.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="px-4 pt-2">
      <button
        type="button"
        onClick={() => void start()}
        disabled={busy}
        className="flex w-full items-center gap-2 rounded-full border border-white/[0.07] bg-[color:var(--surface)] px-4 py-2 text-left transition active:scale-[0.99] disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
        ) : (
          <Tv className="h-3.5 w-3.5 text-primary" />
        )}
        <span className="text-[12px] text-muted-foreground">
          {otherName} está online — assistir junto agora
        </span>
      </button>
    </div>
  );
}
