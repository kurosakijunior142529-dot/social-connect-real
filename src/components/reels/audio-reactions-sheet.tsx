import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Mic, Square, Play, Pause, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UserAvatar } from "@/components/user-avatar";
import { cn } from "@/lib/utils";

const MAX_MS = 10_000;

type Row = {
  id: string; user_id: string; audio_path: string; duration_ms: number; created_at: string;
  author?: { username: string; display_name: string | null; avatar_url: string | null } | null;
};

export function AudioReactionsSheet({ postId, currentUserId, onClose }: { postId: string | null; currentUserId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const key = ["reel-audio", postId];
  const list = useQuery({
    queryKey: key,
    enabled: !!postId,
    queryFn: async () => {
      const { data } = await supabase.from("reel_audio_reactions").select("*").eq("post_id", postId!).order("created_at", { ascending: false }).limit(50);
      const rows = (data ?? []) as Row[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      if (ids.length) {
        const { data: ps } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", ids);
        const m = new Map((ps ?? []).map((p) => [p.id, p]));
        rows.forEach((r) => { r.author = m.get(r.user_id) ?? null; });
      }
      return rows;
    },
  });

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sending, setSending] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const startRef = useRef(0);
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const cleanup = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
    recRef.current?.stream.getTracks().forEach((t) => t.stop());
    recRef.current = null;
    setRecording(false);
  };
  useEffect(() => () => { cleanup(); audioRef.current?.pause(); }, []);
  useEffect(() => { if (!postId) { cleanup(); audioRef.current?.pause(); setPlaying(null); } }, [postId]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        const dur = Math.min(Date.now() - startRef.current, MAX_MS);
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        cleanup();
        if (dur < 600) { toast("Segure um pouco mais para gravar."); return; }
        void upload(blob, dur);
      };
      recRef.current = rec;
      startRef.current = Date.now();
      rec.start();
      setRecording(true);
      setElapsed(0);
      timerRef.current = window.setInterval(() => {
        const ms = Date.now() - startRef.current;
        setElapsed(ms);
        if (ms >= MAX_MS) rec.state === "recording" && rec.stop();
      }, 100);
    } catch {
      toast.error("Permita o microfone para gravar sua reação.");
    }
  };
  const stop = () => { if (recRef.current?.state === "recording") recRef.current.stop(); };

  const upload = async (blob: Blob, dur: number) => {
    if (!postId) return;
    setSending(true);
    const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
    const path = `${currentUserId}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from("reel-audio").upload(path, blob, { contentType: blob.type, upsert: false });
    if (up.error) { setSending(false); toast.error("Não foi possível enviar o áudio."); return; }
    const { error } = await supabase.from("reel_audio_reactions").insert({ post_id: postId, user_id: currentUserId, audio_path: path, duration_ms: Math.max(1, Math.round(dur)) });
    setSending(false);
    if (error) { await supabase.storage.from("reel-audio").remove([path]); toast.error("Não foi possível salvar."); return; }
    toast.success("Reação em áudio enviada");
    void qc.invalidateQueries({ queryKey: key });
  };

  const play = async (r: Row) => {
    if (playing === r.id) { audioRef.current?.pause(); setPlaying(null); return; }
    const { data } = await supabase.storage.from("reel-audio").createSignedUrl(r.audio_path, 600);
    if (!data?.signedUrl) { toast.error("Áudio indisponível."); return; }
    audioRef.current?.pause();
    const a = new Audio(data.signedUrl);
    audioRef.current = a;
    a.onended = () => setPlaying(null);
    setPlaying(r.id);
    a.play().catch(() => setPlaying(null));
  };

  const remove = async (r: Row) => {
    const { error } = await supabase.from("reel_audio_reactions").delete().eq("id", r.id);
    if (error) { toast.error("Não foi possível apagar."); return; }
    await supabase.storage.from("reel-audio").remove([r.audio_path]);
    void qc.invalidateQueries({ queryKey: key });
  };

  const rows = list.data ?? [];
  return (
    <Sheet open={!!postId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="max-h-[75dvh] rounded-t-3xl pb-[calc(1rem+env(safe-area-inset-bottom))]">
        <SheetHeader><SheetTitle>Reações em áudio</SheetTitle></SheetHeader>
        <div className="mt-3 max-h-[45dvh] space-y-2 overflow-y-auto">
          {list.isLoading ? <p className="py-6 text-center text-sm text-muted-foreground">Carregando…</p> :
            rows.length === 0 ? <p className="py-6 text-center text-sm text-muted-foreground">Seja o primeiro a reagir com a sua voz.</p> :
            rows.map((r) => (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl bg-muted/40 p-2.5">
                <UserAvatar avatarPath={r.author?.avatar_url ?? null} displayName={r.author?.display_name ?? r.author?.username ?? "?"} className="h-9 w-9" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.author?.display_name ?? r.author?.username ?? "Alguém"}</p>
                  <p className="text-xs text-muted-foreground">{(r.duration_ms / 1000).toFixed(1)}s</p>
                </div>
                <button onClick={() => play(r)} aria-label={playing === r.id ? "Pausar" : "Ouvir"} className="grid h-9 w-9 place-items-center rounded-full bg-secondary">
                  {playing === r.id ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                </button>
                {r.user_id === currentUserId ? (
                  <button onClick={() => remove(r)} aria-label="Apagar" className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            ))}
        </div>
        <div className="mt-4 flex flex-col items-center gap-2">
          <button
            onClick={recording ? stop : start}
            disabled={sending}
            aria-label={recording ? "Parar gravação" : "Gravar reação"}
            className={cn("grid h-16 w-16 place-items-center rounded-full transition-transform active:scale-95 disabled:opacity-50",
              recording ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground")}
          >
            {recording ? <Square className="h-6 w-6" /> : <Mic className="h-7 w-7" />}
          </button>
          <p className="text-xs text-muted-foreground">
            {sending ? "Enviando…" : recording ? `Gravando ${(elapsed / 1000).toFixed(1)}s / 10s` : "Toque para gravar até 10 segundos"}
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}
