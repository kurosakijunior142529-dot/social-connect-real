import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";

type Req = {
  kind: "confirm" | "prompt" | "alert";
  title: string;
  description?: string;
  confirmText?: string;
  destructive?: boolean;
  defaultValue?: string;
  resolve: (v: any) => void;
};

let push: ((r: Req) => void) | null = null;

function open(r: Omit<Req, "resolve">) {
  return new Promise<any>((resolve) => {
    if (!push) return resolve(r.kind === "prompt" ? null : r.kind === "confirm" ? false : undefined);
    try { navigator.vibrate?.(10); } catch {}
    push({ ...r, resolve });
  });
}

export function appConfirm(
  title: string,
  opts: { description?: string; confirmText?: string; destructive?: boolean } = {},
): Promise<boolean> {
  return open({ kind: "confirm", title, destructive: true, ...opts });
}
export function appPrompt(title: string, defaultValue = ""): Promise<string | null> {
  return open({ kind: "prompt", title, defaultValue, confirmText: "Salvar" });
}
export function appAlert(title: string, description?: string): Promise<void> {
  return open({ kind: "alert", title, description, confirmText: "Ok" });
}

export function AppDialogHost() {
  const [req, setReq] = useState<Req | null>(null);
  const [value, setValue] = useState("");
  useEffect(() => {
    push = (r) => { setValue(r.defaultValue ?? ""); setReq(r); };
    return () => { push = null; };
  }, []);

  function finish(ok: boolean) {
    if (!req) return;
    req.resolve(req.kind === "prompt" ? (ok ? value : null) : req.kind === "confirm" ? ok : undefined);
    setReq(null);
  }

  return (
    <AlertDialog open={!!req} onOpenChange={(o) => !o && finish(false)}>
      <AlertDialogContent className="rounded-3xl max-w-[340px]">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-center">{req?.title}</AlertDialogTitle>
          {req?.description ? (
            <AlertDialogDescription className="text-center">{req.description}</AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        {req?.kind === "prompt" ? (
          <Input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && finish(true)}
            className="rounded-xl"
          />
        ) : null}
        <AlertDialogFooter className="gap-2">
          {req?.kind !== "alert" ? (
            <AlertDialogCancel className="rounded-full" onClick={() => finish(false)}>Cancelar</AlertDialogCancel>
          ) : null}
          <AlertDialogAction
            className={
              "rounded-full " +
              (req?.kind === "confirm" && req.destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "")
            }
            onClick={(e) => { e.preventDefault(); finish(true); }}
          >
            {req?.confirmText ?? "Confirmar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
