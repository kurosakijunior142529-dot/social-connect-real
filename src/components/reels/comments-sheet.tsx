import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PostComments } from "@/components/comments/post-comments";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";

type Props = {
  postId: string | null;
  currentUserId: string;
  onClose: () => void;
};

export function CommentsSheet({ postId, currentUserId, onClose }: Props) {
  const open = !!postId;

  const post = useQuery({
    queryKey: ["post-author", postId],
    enabled: !!postId,
    queryFn: async () => {
      const { data } = await supabase.from("posts").select("author_id").eq("id", postId!).maybeSingle();
      return data?.author_id ?? null;
    },
  });

  return (
    <Drawer open={open} onOpenChange={(v) => !v && onClose()}>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="text-left">
          <DrawerTitle className="text-base">Comentários</DrawerTitle>
        </DrawerHeader>
        <div className="flex min-h-0 flex-1 flex-col px-4 pb-3">
          {postId ? (
            <PostComments
              postId={postId}
              currentUserId={currentUserId}
              postAuthorId={post.data}
              surfaceClassName="bg-[color:var(--surface-2)]"
            />
          ) : null}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
