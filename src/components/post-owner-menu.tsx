import { useState } from "react";
import { EyeOff, MoreHorizontal, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

/** Menu do dono da publicação: permite apagar o próprio post. */
export function PostOwnerMenu({
  postId,
  authorId,
  onDeleted,
  className,
}: {
  postId: string;
  authorId: string;
  onDeleted?: () => void;
  className?: string;
}) {
  const qc = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("posts").delete().match({ id: postId, author_id: authorId });
    setBusy(false);
    if (error) {
      toast.error("Não foi possível apagar a publicação");
      return;
    }
    toast.success("Publicação apagada");
    setConfirm(false);
    qc.setQueriesData<any[] | undefined>({ queryKey: ["feed"] }, (old) =>
      Array.isArray(old) ? old.filter((p) => p?.id !== postId) : old,
    );
    void qc.invalidateQueries({ queryKey: ["feed"] });
    void qc.invalidateQueries({ queryKey: ["profile-posts"] });
    onDeleted?.();
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            className={cn("grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/5", className)}
            aria-label="Opções da publicação"
          >
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm(true)}>
            <Trash2 className="mr-2 h-4 w-4" /> Apagar publicação
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar publicação?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. A publicação, curtidas e comentários serão removidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void remove(); }}>
              {busy ? "Apagando…" : "Apagar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function PostViewerMenu({ postId, className }: { postId: string; className?: string }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);

  async function hide(reason: "not_interested" | "hidden") {
    setBusy(true);
    const { error } = await supabase.from("hidden_posts").upsert({ post_id: postId, reason });
    setBusy(false);
    if (error) return toast.error("Não foi possível ocultar esta publicação");
    qc.setQueriesData<any[] | undefined>({ queryKey: ["feed"] }, (old) =>
      Array.isArray(old) ? old.filter((p) => p?.id !== postId) : old,
    );
    toast.success(reason === "not_interested" ? "Vamos mostrar menos conteúdos assim" : "Publicação ocultada");
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className={cn("grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-[color:var(--surface-2)]", className)} aria-label="Opções da publicação">
          <MoreHorizontal className="h-5 w-5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem disabled={busy} onSelect={() => void hide("not_interested")}>
          <EyeOff className="mr-2 h-4 w-4" /> Não tenho interesse
        </DropdownMenuItem>
        <DropdownMenuItem disabled={busy} onSelect={() => void hide("hidden")}>
          <EyeOff className="mr-2 h-4 w-4" /> Ocultar publicação
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
