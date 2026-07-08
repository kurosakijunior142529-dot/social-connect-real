import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  CornerUpLeft,
  Pencil,
  Trash2,
  Languages,
  MoreHorizontal,
  Copy,
  Pin,
  PinOff,
  Forward,
} from "lucide-react";
import { toast } from "sonner";
import { useAiActions } from "@/hooks/use-ai-actions";

const QUICK_EMOJIS = ["❤️", "😂", "🔥", "👏", "😮", "😢"];

export type MessageContext = { scope: "chat" | "dm"; ownerId: string };

export function MessageActions({
  message,
  ctx,
  mine,
  onReply,
  onEdit,
  onDelete,
  onTranslated,
  onForward,
  onPinToggle,
}: {
  message: {
    id: string;
    content: string | null;
    sender_id: string;
    pinned_at?: string | null;
    kind?: string | null;
  };
  ctx: MessageContext;
  mine: boolean;
  onReply: (m: { id: string; content: string | null }) => void;
  onEdit: (m: { id: string; content: string | null }) => void;
  onDelete: (id: string) => void;
  onTranslated: (id: string, text: string) => void;
  onForward?: (m: any) => void;
  onPinToggle?: (id: string, pinned: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ai = useAiActions();
  const reactTable = ctx.scope === "chat" ? "message_reactions" : "dm_message_reactions";
  const pinned = !!message.pinned_at;

  async function react(emoji: string) {
    const { error } = await (supabase as any).from(reactTable).insert({
      message_id: message.id,
      user_id: ctx.ownerId,
      emoji,
    });
    if (error && !String(error.message).includes("duplicate")) toast.error(error.message);
    setOpen(false);
  }

  async function translate() {
    if (!message.content) return;
    const text = await ai.translate(message.content, "pt-BR");
    if (text) onTranslated(message.id, text);
    setOpen(false);
  }

  async function copyText() {
    if (!message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
      toast.success("Copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
    setOpen(false);
  }

  const canEdit = mine && (message.kind ?? "text") === "text" && !!message.content;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100 transition p-1 rounded-full hover:bg-white/10"
          aria-label="Ações"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2 glass border-white/10" align="end">
        <div className="flex gap-1 pb-2 border-b border-white/5 justify-around">
          {QUICK_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => react(e)}
              className="h-8 w-8 grid place-items-center rounded-full hover:bg-white/10 text-lg"
            >
              {e}
            </button>
          ))}
        </div>
        <div className="pt-2 flex flex-col text-sm">
          <button
            onClick={() => {
              onReply(message);
              setOpen(false);
            }}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
          >
            <CornerUpLeft className="h-4 w-4" /> Responder
          </button>
          {onForward ? (
            <button
              onClick={() => {
                onForward(message);
                setOpen(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
            >
              <Forward className="h-4 w-4" /> Encaminhar
            </button>
          ) : null}
          {message.content ? (
            <button
              onClick={copyText}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
            >
              <Copy className="h-4 w-4" /> Copiar
            </button>
          ) : null}
          {onPinToggle ? (
            <button
              onClick={() => {
                onPinToggle(message.id, !pinned);
                setOpen(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
            >
              {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
              {pinned ? "Desafixar" : "Fixar"}
            </button>
          ) : null}
          {message.content ? (
            <button
              onClick={translate}
              disabled={ai.busy}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 disabled:opacity-50"
            >
              <Languages className="h-4 w-4" /> Traduzir
            </button>
          ) : null}
          {canEdit ? (
            <button
              onClick={() => {
                onEdit(message);
                setOpen(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5"
            >
              <Pencil className="h-4 w-4" /> Editar
            </button>
          ) : null}
          {mine ? (
            <button
              onClick={() => {
                onDelete(message.id);
                setOpen(false);
              }}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 text-destructive"
            >
              <Trash2 className="h-4 w-4" /> Apagar para todos
            </button>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  );
}


export function ReactionsBar({
  reactions, onToggle,
}: {
  reactions: { emoji: string; count: number; mine: boolean }[];
  onToggle: (emoji: string, mine: boolean) => void;
}) {
  if (!reactions.length) return null;
  return (
    <div className="flex flex-wrap gap-1 mt-1">
      {reactions.map((r) => (
        <button
          key={r.emoji}
          onClick={() => onToggle(r.emoji, r.mine)}
          className={
            "text-xs px-2 py-0.5 rounded-full border transition " +
            (r.mine ? "bg-primary/20 border-primary/40" : "bg-white/5 border-white/10 hover:bg-white/10")
          }
        >
          {r.emoji} {r.count > 1 ? r.count : ""}
        </button>
      ))}
    </div>
  );
}

export function ReplyQuote({ text }: { text: string | null | undefined }) {
  if (!text) return null;
  return (
    <div className="border-l-2 border-primary/60 pl-2 mb-1 text-xs opacity-80 line-clamp-2">
      {text}
    </div>
  );
}
