import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Pin, PinOff, Mail, MailOpen, BellOff, Bell, Archive, ArchiveRestore, Lock, Unlock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type ConvPrefs = {
  pinned_at: string | null;
  archived: boolean;
  hidden: boolean;
  marked_unread: boolean;
  cleared_at: string | null;
};

export const EMPTY_PREFS: ConvPrefs = { pinned_at: null, archived: false, hidden: false, marked_unread: false, cleared_at: null };

export async function savePrefs(userId: string, conversationId: string, patch: Partial<ConvPrefs>) {
  const { error } = await supabase
    .from("conversation_prefs")
    .upsert({ user_id: userId, conversation_id: conversationId, ...patch, updated_at: new Date().toISOString() }, { onConflict: "user_id,conversation_id" });
  if (error) throw error;
}

export async function setMute(userId: string, conversationId: string, until: string | null | false) {
  if (until === false) {
    await supabase.from("muted_conversations").delete().eq("user_id", userId).eq("conversation_id", conversationId);
    return;
  }
  await supabase.from("muted_conversations").delete().eq("user_id", userId).eq("conversation_id", conversationId);
  const { error } = await supabase.from("muted_conversations").insert({ user_id: userId, conversation_id: conversationId, until });
  if (error) throw error;
}

export async function hashPin(userId: string, pin: string) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`vibely-vault:${userId}:${pin}`));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const buzz = (p: number | number[] = 10) => {
  try { navigator.vibrate?.(p); } catch { /* */ }
};

/** Linha com gestos: segurar abre ações, deslizar → fixa, ← arquiva. */
export function SwipeRow({
  children,
  onLongPress,
  onSwipeRight,
  onSwipeLeft,
  pinned,
  archived,
}: {
  children: React.ReactNode;
  onLongPress: () => void;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  pinned: boolean;
  archived: boolean;
}) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const horizontal = useRef(false);
  const fired = useRef(false);

  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };

  return (
    <div className="relative overflow-hidden rounded-2xl">
      <div className="absolute inset-0 flex items-center justify-between px-5 text-[12px] font-semibold">
        <span className={cn("flex items-center gap-1.5 text-primary transition-opacity", dx > 20 ? "opacity-100" : "opacity-0")}>
          {pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />} {pinned ? "Desafixar" : "Fixar"}
        </span>
        <span className={cn("flex items-center gap-1.5 text-muted-foreground transition-opacity", dx < -20 ? "opacity-100" : "opacity-0")}>
          {archived ? "Desarquivar" : "Arquivar"} {archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </span>
      </div>
      <div
        style={{ transform: `translateX(${dx}px)`, transition: start.current ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1)" }}
        className="relative bg-background touch-pan-y"
        onContextMenu={(e) => { e.preventDefault(); buzz(12); onLongPress(); }}
        onPointerDown={(e) => {
          start.current = { x: e.clientX, y: e.clientY, t: Date.now() };
          horizontal.current = false;
          fired.current = false;
          clear();
          timer.current = setTimeout(() => { fired.current = true; buzz(12); onLongPress(); }, 480);
        }}
        onPointerMove={(e) => {
          if (!start.current) return;
          const mx = e.clientX - start.current.x;
          const my = e.clientY - start.current.y;
          if (Math.abs(mx) > 8 || Math.abs(my) > 8) clear();
          if (!horizontal.current && Math.abs(mx) > 14 && Math.abs(mx) > Math.abs(my) * 1.4) horizontal.current = true;
          if (horizontal.current) setDx(Math.max(-110, Math.min(110, mx)));
        }}
        onPointerUp={() => {
          clear();
          if (horizontal.current) {
            if (dx > 70) { buzz(14); onSwipeRight(); }
            else if (dx < -70) { buzz(14); onSwipeLeft(); }
          }
          start.current = null;
          setDx(0);
        }}
        onPointerCancel={() => { clear(); start.current = null; setDx(0); }}
        onClickCapture={(e) => {
          if (horizontal.current || fired.current) { e.preventDefault(); e.stopPropagation(); horizontal.current = false; fired.current = false; }
        }}
      >
        {children}
      </div>
    </div>
  );
}

export function ConversationActionsSheet({
  open,
  onOpenChange,
  name,
  prefs,
  muted,
  unread,
  onAction,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  name: string;
  prefs: ConvPrefs;
  muted: boolean;
  unread: boolean;
  onAction: (a: "pin" | "read" | "unread" | "mute8h" | "mute1w" | "muteAlways" | "unmute" | "archive" | "hide" | "delete") => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [muteOpen, setMuteOpen] = useState(false);
  const act = (a: Parameters<typeof onAction>[0]) => { buzz(8); onAction(a); onOpenChange(false); setConfirmDelete(false); setMuteOpen(false); };

  const Item = ({ icon, label, hint, onClick, danger }: { icon: React.ReactNode; label: string; hint?: string; onClick: () => void; danger?: boolean }) => (
    <button
      onClick={onClick}
      className={cn("flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-left transition active:scale-[0.99] active:bg-[color:var(--surface-2)]", danger && "text-destructive")}
    >
      <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[color:var(--surface-2)]", danger && "bg-destructive/10")}>{icon}</span>
      <span className="flex-1">
        <span className="block text-[14px] font-medium">{label}</span>
        {hint && <span className="block text-[12px] text-muted-foreground">{hint}</span>}
      </span>
    </button>
  );

  return (
    <Drawer open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setConfirmDelete(false); setMuteOpen(false); } }}>
      <DrawerContent className="pb-6">
        <DrawerTitle className="px-5 pt-2 pb-3 text-center text-[13px] font-semibold text-muted-foreground truncate">{name}</DrawerTitle>
        {confirmDelete ? (
          <div className="space-y-3 px-5">
            <p className="text-center text-[14px]">Apagar a conversa com <b>{name}</b>?</p>
            <p className="text-center text-[12px] text-muted-foreground">Some apenas para você. Se a pessoa mandar algo novo, a conversa volta limpa.</p>
            <div className="flex gap-2 pt-1">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-full bg-[color:var(--surface-2)] py-3 text-[14px] font-medium">Cancelar</button>
              <button onClick={() => act("delete")} className="flex-1 rounded-full bg-destructive py-3 text-[14px] font-semibold text-destructive-foreground">Apagar</button>
            </div>
          </div>
        ) : muteOpen ? (
          <div className="space-y-1 px-3">
            <Item icon={<BellOff className="h-4 w-4" />} label="Por 8 horas" onClick={() => act("mute8h")} />
            <Item icon={<BellOff className="h-4 w-4" />} label="Por 1 semana" onClick={() => act("mute1w")} />
            <Item icon={<BellOff className="h-4 w-4" />} label="Sempre" onClick={() => act("muteAlways")} />
            <button onClick={() => setMuteOpen(false)} className="mt-2 w-full py-2 text-[13px] text-muted-foreground">Voltar</button>
          </div>
        ) : (
          <div className="space-y-0.5 px-3">
            <Item icon={prefs.pinned_at ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4 text-primary" />} label={prefs.pinned_at ? "Desafixar" : "Fixar no topo"} onClick={() => act("pin")} />
            <Item icon={unread ? <MailOpen className="h-4 w-4" /> : <Mail className="h-4 w-4" />} label={unread ? "Marcar como lida" : "Marcar como não lida"} onClick={() => act(unread ? "read" : "unread")} />
            {muted ? (
              <Item icon={<Bell className="h-4 w-4" />} label="Reativar notificações" onClick={() => act("unmute")} />
            ) : (
              <Item icon={<BellOff className="h-4 w-4" />} label="Silenciar" hint="8 horas, 1 semana ou sempre" onClick={() => setMuteOpen(true)} />
            )}
            <Item icon={prefs.archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />} label={prefs.archived ? "Desarquivar" : "Arquivar"} hint={prefs.archived ? undefined : "Sai da lista, sem apagar nada"} onClick={() => act("archive")} />
            <Item icon={prefs.hidden ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />} label={prefs.hidden ? "Tirar do Cofre" : "Guardar no Cofre"} hint={prefs.hidden ? undefined : "Some da lista e só abre com o seu PIN"} onClick={() => act("hide")} />
            <Item danger icon={<Trash2 className="h-4 w-4" />} label="Apagar conversa" onClick={() => setConfirmDelete(true)} />
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

/** Pede ou cria o PIN de 4 dígitos do Cofre. */
export function VaultPinSheet({ open, onOpenChange, userId, onUnlocked }: { open: boolean; onOpenChange: (o: boolean) => void; userId: string; onUnlocked: () => void }) {
  const [pin, setPin] = useState("");
  const [mode, setMode] = useState<"loading" | "create" | "confirm" | "enter">("loading");
  const [first, setFirst] = useState("");
  const [stored, setStored] = useState<string | null>(null);
  const [error, setError] = useState(false);

  const load = async () => {
    setPin(""); setError(false); setFirst("");
    const { data } = await supabase.from("chat_vault").select("pin_hash").eq("user_id", userId).maybeSingle();
    setStored(data?.pin_hash ?? null);
    setMode(data ? "enter" : "create");
  };

  const press = async (d: string) => {
    if (pin.length >= 4) return;
    buzz(6);
    const next = pin + d;
    setPin(next);
    setError(false);
    if (next.length < 4) return;
    if (mode === "create") { setFirst(next); setPin(""); setMode("confirm"); return; }
    if (mode === "confirm") {
      if (next !== first) { setError(true); buzz([20, 40, 20]); setPin(""); setMode("create"); return; }
      const h = await hashPin(userId, next);
      const { error: e } = await supabase.from("chat_vault").upsert({ user_id: userId, pin_hash: h, updated_at: new Date().toISOString() });
      if (e) { toast.error("Não deu para salvar o PIN"); return; }
      toast.success("Cofre criado");
      onOpenChange(false); onUnlocked(); return;
    }
    const h = await hashPin(userId, next);
    if (h === stored) { onOpenChange(false); onUnlocked(); }
    else { setError(true); buzz([20, 40, 20]); setTimeout(() => setPin(""), 250); }
  };

  const title = mode === "create" ? "Crie um PIN para o Cofre" : mode === "confirm" ? "Repita o PIN" : "Digite seu PIN";

  return (
    <Drawer open={open} onOpenChange={(o) => { onOpenChange(o); if (o) void load(); }}>
      <DrawerContent className="pb-8" onOpenAutoFocus={() => void load()}>
        <div className="flex flex-col items-center gap-4 px-6 pt-3">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-[color:var(--surface-2)]"><Lock className="h-5 w-5" /></span>
          <DrawerTitle className="text-[16px] font-semibold">{mode === "loading" ? "Cofre" : title}</DrawerTitle>
          <p className="h-4 text-[12px] text-muted-foreground">{error ? (mode === "create" ? "Os PINs não batem. Tente de novo." : "PIN incorreto") : "Conversas guardadas aqui não aparecem na lista."}</p>
          <div className={cn("flex gap-3", error && "animate-[shake_0.3s]")}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={cn("h-3 w-3 rounded-full border border-[color:var(--hairline)] transition", i < pin.length ? (error ? "bg-destructive" : "bg-primary border-transparent") : "bg-transparent")} />
            ))}
          </div>
          <div className="grid w-full max-w-[260px] grid-cols-3 gap-3 pt-2">
            {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k, i) =>
              k === "" ? <span key={i} /> : (
                <button
                  key={i}
                  disabled={mode === "loading"}
                  onClick={() => (k === "⌫" ? setPin((p) => p.slice(0, -1)) : void press(k))}
                  className="h-14 rounded-full bg-[color:var(--surface-2)] text-[20px] font-medium transition active:scale-95"
                >
                  {k}
                </button>
              ),
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
