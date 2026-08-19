import { useState } from "react";
import { MoreHorizontal, Flag, Ban, ShieldOff } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
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
import { ReportDialog, type ReportTargetType } from "@/components/report-dialog";
import { useBlocks, useBlockUser } from "@/hooks/use-blocks";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

export function UserActionsMenu({
  targetUserId,
  targetUsername,
  postId,
  messageId,
  className,
}: {
  targetUserId: string;
  targetUsername?: string;
  /** If provided, a "Denunciar post" option is shown alongside "Denunciar usuário" */
  postId?: string;
  /** If provided, a "Denunciar mensagem" option is shown */
  messageId?: string;
  /** If provided, a "Denunciar comentário" option is shown */
  commentId?: string;
  /** If provided, a "Denunciar story" option is shown */
  storyId?: string;
  /** If provided, a "Denunciar live" option is shown */
  liveId?: string;
  className?: string;
}) {
  const { user } = useAuth();
  const blocks = useBlocks();
  const blockMut = useBlockUser();
  const [reportOpen, setReportOpen] = useState(false);
  const [reportTarget, setReportTarget] = useState<{ type: ReportTargetType; id: string; label: string }>({
    type: "user",
    id: targetUserId,
    label: targetUsername ? `@${targetUsername}` : "usuário",
  });
  const [confirmBlock, setConfirmBlock] = useState(false);

  if (!user || user.id === targetUserId) return null;

  const isBlocked = blocks.data?.blocked.has(targetUserId) ?? false;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "p-2 rounded-full hover:bg-muted text-muted-foreground",
            className,
          )}
          aria-label="Mais opções"
        >
          <MoreHorizontal className="h-5 w-5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="rounded-2xl">
          {postId ? (
            <DropdownMenuItem
              onClick={() => {
                setReportTarget({ type: "post", id: postId, label: "post" });
                setReportOpen(true);
              }}
            >
              <Flag className="h-4 w-4 mr-2" /> Denunciar post
            </DropdownMenuItem>
          ) : null}
          {messageId ? (
            <DropdownMenuItem
              onClick={() => {
                setReportTarget({ type: "message", id: messageId, label: "mensagem" });
                setReportOpen(true);
              }}
            >
              <Flag className="h-4 w-4 mr-2" /> Denunciar mensagem
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            onClick={() => {
              setReportTarget({
                type: "user",
                id: targetUserId,
                label: targetUsername ? `@${targetUsername}` : "usuário",
              });
              setReportOpen(true);
            }}
          >
            <Flag className="h-4 w-4 mr-2" /> Denunciar usuário
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {isBlocked ? (
            <DropdownMenuItem
              onClick={() => blockMut.mutate({ targetId: targetUserId, block: false })}
            >
              <ShieldOff className="h-4 w-4 mr-2" /> Desbloquear
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setConfirmBlock(true)}
            >
              <Ban className="h-4 w-4 mr-2" /> Bloquear
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <ReportDialog
        open={reportOpen}
        onOpenChange={setReportOpen}
        targetType={reportTarget.type}
        targetId={reportTarget.id}
        targetLabel={reportTarget.label}
      />

      <AlertDialog open={confirmBlock} onOpenChange={setConfirmBlock}>
        <AlertDialogContent className="rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Bloquear {targetUsername ? `@${targetUsername}` : "este usuário"}?</AlertDialogTitle>
            <AlertDialogDescription>
              Vocês deixarão de se seguir e não verão os posts, perfis ou mensagens um do outro. Você pode desbloquear a qualquer momento.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive hover:bg-destructive/90"
              onClick={() => blockMut.mutate({ targetId: targetUserId, block: true })}
            >
              Bloquear
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
