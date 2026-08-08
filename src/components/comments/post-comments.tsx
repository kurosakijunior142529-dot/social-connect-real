import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, X, Smile, SmilePlus } from "lucide-react";
import { EmojiText, AppEmojiPicker } from "@/components/chat/app-emoji";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { StickerPicker, type StickerItem } from "@/components/chat/sticker-picker";

type CommentRow = {
  id: string;
  post_id: string;
  author_id: string;
  content: string;
  created_at: string;
  parent_id: string | null;
  edited_at: string | null;
  sticker_url: string | null;
  author?: { id: string; username: string; display_name: string; avatar_url: string | null };
};

type Node = CommentRow & { replies: CommentRow[] };

export function usePostComments(postId: string | null) {
  return useQuery({
    queryKey: ["comments", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", postId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const rows = (data ?? []) as unknown as CommentRow[];
      const ids = Array.from(new Set(rows.map((c) => c.author_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      const withAuthors = rows.map((c) => ({ ...c, author: map.get(c.author_id) }));
      const byId = new Map(withAuthors.map((c) => [c.id, { ...c, replies: [] as CommentRow[] } as Node]));
      const roots: Node[] = [];
      for (const c of withAuthors) {
        const node = byId.get(c.id)!;
        const parent = c.parent_id ? byId.get(c.parent_id) : undefined;
        if (parent) parent.replies.push(node);
        else roots.push(node);
      }
      return roots;
    },
  });
}

export function PostComments({
  postId,
  currentUserId,
  postAuthorId,
  surfaceClassName = "bg-muted",
}: {
  postId: string;
  currentUserId: string;
  postAuthorId?: string | null;
  surfaceClassName?: string;
}) {
  const qc = useQueryClient();
  const comments = usePostComments(postId);
  const [draft, setDraft] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);

  function refresh() {
    qc.invalidateQueries({ queryKey: ["comments", postId] });
    qc.invalidateQueries({ queryKey: ["reels"] });
    qc.invalidateQueries({ queryKey: ["feed"] });
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const parentId = replyTo?.id ?? null;
    setReplyTo(null);
    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      author_id: currentUserId,
      content: text,
      ...(parentId ? { parent_id: parentId } : {}),
    } as any);
    if (error) {
      setDraft(text);
      toast.error(error.message ?? "Não foi possível comentar");
      return;
    }
    refresh();
  }

  async function sendSticker(s: StickerItem) {
    const parentId = replyTo?.id ?? null;
    setReplyTo(null);
    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      author_id: currentUserId,
      content: "",
      sticker_url: s.url,
      ...(parentId ? { parent_id: parentId } : {}),
    } as any);
    if (error) {
      toast.error(error.message ?? "Não foi possível enviar a figurinha");
      return;
    }
    refresh();
  }


  async function saveEdit(e: FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const text = editing.text.trim();
    if (!text) return;
    const { error } = await supabase.from("comments").update({ content: text }).eq("id", editing.id);
    if (error) {
      toast.error(error.message ?? "Não foi possível editar");
      return;
    }
    setEditing(null);
    refresh();
  }

  async function remove(id: string) {
    const { error } = await supabase.from("comments").delete().eq("id", id);
    if (error) {
      toast.error(error.message ?? "Não foi possível excluir");
      return;
    }
    refresh();
  }

  function renderComment(c: CommentRow, isReply = false) {
    const canEdit = c.author_id === currentUserId;
    const canDelete = canEdit || (!!postAuthorId && postAuthorId === currentUserId);
    return (
      <div key={c.id} className={cn("flex items-start gap-3", isReply && "ml-10")}>
        <UserAvatar
          avatarPath={c.author?.avatar_url}
          displayName={c.author?.display_name ?? "?"}
          className="h-8 w-8"
        />
        <div className="flex-1 min-w-0">
          <div className={cn("rounded-2xl px-3 py-2", surfaceClassName)}>
            <div className="text-xs font-semibold">
              {c.author?.display_name ?? `@${c.author?.username ?? ""}`}
            </div>
            {editing?.id === c.id ? (
              <form onSubmit={saveEdit} className="mt-1 flex items-center gap-2">
                <Input
                  value={editing.text}
                  onChange={(e) => setEditing({ id: c.id, text: e.target.value })}
                  maxLength={500}
                  autoFocus
                  className="h-8 rounded-full"
                />
                <Button type="submit" size="sm" className="h-8 rounded-full">
                  Salvar
                </Button>
                <button type="button" onClick={() => setEditing(null)} aria-label="Cancelar">
                  <X className="h-4 w-4" />
                </button>
              </form>
            ) : c.sticker_url ? (
              <img
                src={c.sticker_url}
                alt="figurinha"
                loading="lazy"
                className="h-24 w-24 object-contain"
              />
            ) : (
              <div className="text-sm leading-snug break-words">
                <EmojiText text={c.content} />
                {c.edited_at ? (
                  <span className="ml-1 text-[10px] text-muted-foreground">(editado)</span>
                ) : null}
              </div>
            )}
          </div>
          {editing?.id === c.id ? null : (
            <div className="mt-1 flex gap-3 px-2 text-[11px] text-muted-foreground">
              <button
                type="button"
                onClick={() =>
                  setReplyTo({ id: c.parent_id ?? c.id, name: c.author?.username ?? "" })
                }
              >
                Responder
              </button>
              {canEdit ? (
                <button type="button" onClick={() => setEditing({ id: c.id, text: c.content })}>
                  Editar
                </button>
              ) : null}
              {canDelete ? (
                <button type="button" onClick={() => remove(c.id)}>
                  Excluir
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto">
        {comments.data?.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Seja o primeiro a comentar.</p>
        ) : null}
        {comments.data?.map((c) => (
          <div key={c.id} className="space-y-2">
            {renderComment(c)}
            {c.replies.map((r) => renderComment(r, true))}
          </div>
        ))}
      </div>

      {replyTo ? (
        <div className="flex items-center justify-between px-1 pt-2 text-[11px] text-muted-foreground">
          <span>Respondendo @{replyTo.name}</span>
          <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancelar resposta">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <form onSubmit={submit} className="flex items-center gap-2 pt-2">
        <StickerPicker
          userId={currentUserId}
          onPick={(s) => void sendSticker(s)}
          trigger={
            <button
              type="button"
              aria-label="Figurinhas"
              className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted"
            >
              <Smile className="h-4 w-4" />
            </button>
          }
        />
        <AppEmojiPicker onPick={(code) => setDraft((d) => (d ? `${d} ${code}` : code))}>
          <button
            type="button"
            aria-label="Emojis do app"
            className="shrink-0 rounded-full p-2 text-muted-foreground hover:bg-muted"
          >
            <SmilePlus className="h-4 w-4" />
          </button>
        </AppEmojiPicker>
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={replyTo ? "Escreva sua resposta…" : "Adicione um comentário…"}
          maxLength={500}
          className={cn("rounded-full border-transparent", surfaceClassName)}
        />
        <Button type="submit" size="icon" className="shrink-0 rounded-full" disabled={!draft.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}
