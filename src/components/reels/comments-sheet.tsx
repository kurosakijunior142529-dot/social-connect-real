import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

type Props = {
  postId: string | null;
  currentUserId: string;
  onClose: () => void;
};

export function CommentsSheet({ postId, currentUserId, onClose }: Props) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState("");
  const open = !!postId;

  const comments = useQuery({
    queryKey: ["comments", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("comments")
        .select("*")
        .eq("post_id", postId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = Array.from(new Set((data ?? []).map((c) => c.author_id)));
      const { data: profs } = ids.length
        ? await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids)
        : { data: [] as any[] };
      const map = new Map((profs ?? []).map((p: any) => [p.id, p]));
      return (data ?? []).map((c: any) => ({ ...c, author: map.get(c.author_id) }));
    },
  });

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!postId) return;
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    const { error } = await supabase.from("comments").insert({
      post_id: postId,
      author_id: currentUserId,
      content: text,
    });
    if (error) setDraft(text);
    else {
      qc.invalidateQueries({ queryKey: ["comments", postId] });
      qc.invalidateQueries({ queryKey: ["reels"] });
    }
  }

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base">Comentários</DrawerTitle>
        </DrawerHeader>
        <div className="flex-1 overflow-y-auto px-4 space-y-3 pb-2">
          {comments.data?.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Seja o primeiro a comentar.
            </p>
          ) : null}
          {comments.data?.map((c: any) => (
            <div key={c.id} className="flex items-start gap-3">
              <UserAvatar
                avatarPath={c.author?.avatar_url}
                displayName={c.author?.display_name ?? "?"}
                className="h-8 w-8"
              />
              <div className="flex-1 rounded-2xl bg-[color:var(--surface-2)] px-3 py-2">
                <div className="text-xs font-semibold">@{c.author?.username}</div>
                <div className="text-sm leading-snug">{c.content}</div>
              </div>
            </div>
          ))}
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 p-3 pt-2 hairline-t">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Adicione um comentário…"
            maxLength={500}
            className="rounded-full bg-[color:var(--surface-2)] border-transparent"
          />
          <Button type="submit" size="icon" className="rounded-full shrink-0" disabled={!draft.trim()}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </DrawerContent>
    </Drawer>
  );
}
