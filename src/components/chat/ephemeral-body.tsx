import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Eye, EyeOff, Timer, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Props = {
  msg: any;
  mine: boolean;
  render: (msg: any) => React.ReactNode;
};

/** Recado que some: mídia liberada uma única vez, com contagem e aviso de captura. */
export function EphemeralBody({ msg, mine, render }: Props) {
  const [open, setOpen] = useState(false);
  const [left, setLeft] = useState(12);
  const [burned, setBurned] = useState<boolean>(
    !!msg?.meta?.viewed_at || (!!msg?.expires_at && new Date(msg.expires_at).getTime() < Date.now()),
  );
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setLeft(12);
    timer.current = window.setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          window.clearInterval(timer.current!);
          setOpen(false);
          setBurned(true);
          return 0;
        }
        return v - 1;
      });
    }, 1000);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "PrintScreen") report();
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") report();
    };
    window.addEventListener("keyup", onKey);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      if (timer.current) window.clearInterval(timer.current);
      window.removeEventListener("keyup", onKey);
      document.removeEventListener("visibilitychange", onHide);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function report() {
    try {
      await (supabase as any).rpc("report_ephemeral_capture", { _id: msg.id });
    } catch {
      /* silencioso */
    }
  }

  async function openOnce() {
    try {
      await (supabase as any).rpc("view_ephemeral_message", { _id: msg.id });
      setOpen(true);
    } catch (e: any) {
      toast.error(e?.message ?? "Não foi possível abrir");
    }
  }

  if (mine) {
    return (
      <div className="flex items-center gap-2 text-[13px]">
        <Timer className="h-4 w-4 shrink-0 opacity-80" strokeWidth={1.8} />
        <span>Recado que some</span>
        <span className="opacity-70 text-[11px]">
          {msg?.meta?.viewed_at ? "· visto" : "· não visto"}
        </span>
      </div>
    );
  }

  if (burned) {
    return (
      <div className="flex items-center gap-2 text-[13px] opacity-70">
        <EyeOff className="h-4 w-4 shrink-0" strokeWidth={1.8} />
        <span>Recado expirado</span>
      </div>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={openOnce}
        className="flex items-center gap-2 text-[13px] font-medium text-primary"
      >
        <Eye className="h-4 w-4 shrink-0" strokeWidth={1.8} />
        Toque para ver uma vez
      </button>
      {open
        ? createPortal(
            <div className="fixed inset-0 z-[100] bg-black/95 flex flex-col select-none">
              <div className="flex items-center justify-between px-4 h-14 text-white">
                <span className="text-[12px] uppercase tracking-widest opacity-70">
                  some em {left}s
                </span>
                <button
                  onClick={() => {
                    setOpen(false);
                    setBurned(true);
                  }}
                  aria-label="Fechar"
                  className="p-2 rounded-full active:bg-white/10"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className={cn("flex-1 min-h-0 flex items-center justify-center p-4")}>
                <div className="max-w-full max-h-full">{render(msg)}</div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
