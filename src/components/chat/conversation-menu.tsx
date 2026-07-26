import { useState } from "react";
import { MoreVertical, Search, Pin, Bell, BellOff, Ban, Flag, Palette, Sparkles } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ConversationMenu({
  scope,
  parentId,
  currentUserId,
  otherUserId,
  onOpenSearch,
  onOpenPinned,
  onOpenWallpaper,
  onOpenCustomize,
  onReport,
}: {
  scope: "dm" | "chat";
  parentId: string;
  currentUserId: string;
  otherUserId?: string | null;
  onOpenSearch: () => void;
  onOpenPinned: () => void;
  onOpenWallpaper?: () => void;
  onOpenCustomize?: () => void;
  onReport?: () => void;
}) {
  const qc = useQueryClient();
  const muteTable = scope === "dm" ? "muted_conversations" : "muted_chats";
  const muteCol = scope === "dm" ? "conversation_id" : "chat_id";
  const [busy, setBusy] = useState(false);

  const muteQ = useQuery({
    queryKey: ["mute", muteTable, parentId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from(muteTable)
        .select(muteCol)
        .eq("user_id", currentUserId)
        .eq(muteCol, parentId)
        .maybeSingle();
      return !!data;
    },
  });
  const muted = muteQ.data === true;

  async function toggleMute() {
    setBusy(true);
    if (muted) {
      await (supabase as any).from(muteTable).delete().match({ user_id: currentUserId, [muteCol]: parentId });
    } else {
      await (supabase as any).from(muteTable).insert({ user_id: currentUserId, [muteCol]: parentId });
    }
    setBusy(false);
    qc.invalidateQueries({ queryKey: ["mute", muteTable, parentId] });
    toast.success(muted ? "Notificações reativadas" : "Conversa silenciada");
  }

  async function block() {
    if (!otherUserId) return;
    if (!confirm("Bloquear este usuário?")) return;
    const { error } = await (supabase as any)
      .from("blocks")
      .insert({ blocker_id: currentUserId, blocked_id: otherUserId });
    if (error) toast.error(error.message);
    else toast.success("Usuário bloqueado");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 rounded-full active:bg-[color:var(--surface-2)]"
          aria-label="Mais opções"
        >
          <MoreVertical className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 glass border-white/10">
        <DropdownMenuItem onSelect={onOpenSearch}>
          <Search className="h-4 w-4 mr-2" /> Buscar mensagens
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onOpenPinned}>
          <Pin className="h-4 w-4 mr-2" /> Mensagens fixadas
        </DropdownMenuItem>
        {onOpenCustomize ? (
          <DropdownMenuItem onSelect={onOpenCustomize}>
            <Sparkles className="h-4 w-4 mr-2" /> Personalizar conversa
          </DropdownMenuItem>
        ) : null}
        {scope === "dm" && onOpenWallpaper ? (
          <DropdownMenuItem onSelect={onOpenWallpaper}>
            <Palette className="h-4 w-4 mr-2" /> Papel de parede
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem onSelect={toggleMute} disabled={busy}>
          {muted ? <Bell className="h-4 w-4 mr-2" /> : <BellOff className="h-4 w-4 mr-2" />}
          {muted ? "Reativar notificações" : "Silenciar"}
        </DropdownMenuItem>
        {otherUserId ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={block} className="text-destructive focus:text-destructive">
              <Ban className="h-4 w-4 mr-2" /> Bloquear
            </DropdownMenuItem>
            {onReport ? (
              <DropdownMenuItem onSelect={onReport} className="text-destructive focus:text-destructive">
                <Flag className="h-4 w-4 mr-2" /> Denunciar
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
