import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AudioRecorder } from "@/components/chat/audio-recorder";
import { SintoniaAudio, SintoniaDraftAudio } from "@/components/chat/sintonia-audio";
import { SINTONIA_MOODS, SINTONIA_AUDIO_MAX_MS, SINTONIA_TEXT_MAX, sintoniaMood, validSintoniaAudio } from "@/lib/sintonias";
import { formatDuration, uploadChatFile } from "@/lib/chat-media";
import { cn } from "@/lib/utils";
import { useGlobalPresence } from "@/lib/presence";
import { Plus, Radio, AudioLines, Send, Trash2, Clock3, Loader2 } from "lucide-react";
import { toast } from "sonner";

type Profile = { username: string; display_name: string | null; avatar_url: string | null };
type Sintonia = { user_id: string; content: string; mood: string; audio_path: string | null; audio_duration_ms: number | null; expires_at: string; profile?: Profile };
type DraftAudio = { file: File; duration: number };

export function NotesRail({ currentUserId }: { currentUserId: string }) {
  const { online } = useGlobalPresence(currentUserId);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Sintonia | null>(null);
  const [text, setText] = useState("");
  const [mood, setMood] = useState("livre");
  const [draft, setDraft] = useState<DraftAudio | null>(null);
  const [keepAudio, setKeepAudio] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  const notes = useQuery({
    queryKey: ["user-notes", currentUserId],
    staleTime: 15_000,
    refetchInterval: 30_000,
    queryFn: async () => {
      const { data: follows, error: followError } = await supabase.from("follows").select("following_id").eq("follower_id", currentUserId);
      if (followError) throw followError;
      const ids = [currentUserId, ...(follows ?? []).map((f) => f.following_id)];
      const { data: rows, error } = await supabase.from("user_notes").select("user_id, content, mood, audio_path, audio_duration_ms, expires_at").in("user_id", ids).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false });
      if (error) throw error;
      const profileIds = [...new Set([currentUserId, ...(rows ?? []).map((n) => n.user_id)])];
      const { data: profiles, error: profileError } = await supabase.from("profiles").select("id, username, display_name, avatar_url").in("id", profileIds);
      if (profileError) throw profileError;
      const pmap = new Map((profiles ?? []).map((p) => [p.id, p]));
      const all: Sintonia[] = (rows ?? []).map((row) => ({ ...row, profile: pmap.get(row.user_id) }));
      return { mine: all.find((n) => n.user_id === currentUserId) ?? null, others: all.filter((n) => n.user_id !== currentUserId), me: pmap.get(currentUserId) };
    },
  });

  useEffect(() => {
    const channel = supabase.channel(`sintonias:${currentUserId}`).on("postgres_changes", { event: "*", schema: "public", table: "user_notes" }, () => { void qc.invalidateQueries({ queryKey: ["user-notes", currentUserId] }); }).subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [currentUserId, qc]);

  const mine = notes.data?.mine;
  const me = notes.data?.me;
  const author = (n: Sintonia) => n.profile?.display_name ?? n.profile?.username ?? "Amigo";
  const startEdit = () => {
    setText(mine?.content === "🎙 Sintonia de voz" ? "" : mine?.content ?? "");
    setMood(mine?.mood ?? "livre"); setKeepAudio(!!mine?.audio_path); setDraft(null); setOpen(true);
  };

  const save = async () => {
    if (saving) return;
    const content = text.trim();
    if (!content && !draft && !keepAudio) return;
    setSaving(true);
    let uploaded: string | null = null;
    let committed = false;
    try {
      let path = keepAudio ? mine?.audio_path ?? null : null;
      let duration = keepAudio ? mine?.audio_duration_ms ?? null : null;
      if (draft) {
        if (!validSintoniaAudio(draft.duration)) throw new Error("O áudio deve ter até 10 segundos");
        const result = await uploadChatFile(currentUserId, draft.file, "chat-audio");
        path = result.path; uploaded = path; duration = draft.duration;
      }
      const { error } = await supabase.from("user_notes").upsert({ user_id: currentUserId, content: content || "🎙 Sintonia de voz", mood, audio_path: path, audio_duration_ms: duration });
      if (error) throw error;
      committed = true;
      if (mine?.audio_path && mine.audio_path !== path) await supabase.storage.from("chat-audio").remove([mine.audio_path]);
      await qc.invalidateQueries({ queryKey: ["user-notes", currentUserId] });
      navigator.vibrate?.(10); setOpen(false); setDraft(null); toast.success("Sintonia publicada");
    } catch (error) {
      if (uploaded && !committed) await supabase.storage.from("chat-audio").remove([uploaded]);
      toast.error(error instanceof Error ? error.message : "Não foi possível publicar sua Sintonia");
    } finally { setSaving(false); }
  };

  const remove = async () => {
    setSaving(true);
    try {
      const { error } = await supabase.from("user_notes").delete().eq("user_id", currentUserId);
      if (error) throw error;
      if (mine?.audio_path) await supabase.storage.from("chat-audio").remove([mine.audio_path]);
      await qc.invalidateQueries({ queryKey: ["user-notes", currentUserId] });
      setOpen(false); toast.success("Sintonia apagada");
    } catch { toast.error("Não foi possível apagar sua Sintonia"); }
    finally { setSaving(false); }
  };

  const sendReply = async () => {
    if (!selected || !reply.trim() || replying) return;
    setReplying(true);
    try {
      const { data: conversationId, error: conversationError } = await supabase.rpc("get_or_create_conversation", { _other_user: selected.user_id });
      if (conversationError || !conversationId) throw conversationError ?? new Error("Conversa indisponível");
      const { error } = await supabase.from("messages").insert({ conversation_id: conversationId, sender_id: currentUserId, kind: "text", content: `Respondeu à sua Sintonia ${sintoniaMood(selected.mood).emoji}\n“${selected.content}”\n\n${reply.trim()}` });
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["conversations"] });
      setSelected(null); setReply("");
      void navigate({ to: "/messages/$conversationId", params: { conversationId } });
    } catch { toast.error("Não foi possível enviar a resposta"); }
    finally { setReplying(false); }
  };

  return <>
    <section aria-label="Sintonias" className="sintonias-section border-b border-border pb-2 pt-1" data-swipe-lock>
      <div className="flex gap-3 overflow-x-auto px-4 pt-7 no-scrollbar">
        <button type="button" onClick={startEdit} aria-label="Sua Sintonia" className="relative flex w-16 shrink-0 flex-col items-center gap-1">
          <span className="absolute -top-6 left-1/2 max-w-[72px] -translate-x-1/2 truncate rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] shadow-sm">{mine ? `${sintoniaMood(mine.mood).emoji} ${mine.audio_path ? "🎙" : mine.content}` : "Sintonia?"}</span>
          <span className="relative"><UserAvatar avatarPath={me?.avatar_url} displayName={me?.display_name ?? me?.username ?? "Você"} className="h-14 w-14" />{!mine && <span className="absolute bottom-0 right-0 flex h-5 w-5 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground"><Plus className="h-3 w-3" /></span>}</span>
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">Você</span>
        </button>
        {notes.data?.others.map((n) => <button type="button" key={n.user_id} onClick={() => { setReply(""); setSelected(n); }} aria-label={`Sintonia de ${author(n)}`} className={cn("relative flex w-16 shrink-0 flex-col items-center gap-1", `sintonia-${n.mood}`)}>
          <span className="absolute -top-6 left-1/2 max-w-[72px] -translate-x-1/2 truncate rounded-full border border-border bg-surface px-2 py-0.5 text-[10px] shadow-sm">{sintoniaMood(n.mood).emoji} {n.audio_path ? "🎙" : n.content}</span>
          <span className="relative"><span className="sintonia-aura"><UserAvatar avatarPath={n.profile?.avatar_url} displayName={author(n)} className="h-14 w-14" /></span>{online[n.user_id] && <span role="img" aria-label={`${author(n)} online agora`} className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-background bg-primary" />}</span>
          <span className="w-full truncate text-center text-[10px] text-muted-foreground">{author(n)}</span>
        </button>)}
      </div>
      {notes.isError && <div className="flex items-center justify-between px-4 pt-2 text-xs text-muted-foreground"><span>Sintonias indisponíveis agora.</span><Button variant="ghost" size="sm" onClick={() => void notes.refetch()}>Tentar de novo</Button></div>}
    </section>

    <Dialog open={open} onOpenChange={(value) => { if (!saving) { setOpen(value); if (!value) setDraft(null); } }}>
      <DialogContent className="max-h-[85dvh] w-[calc(100%-2rem)] max-w-sm overflow-y-auto rounded-lg p-5" data-swipe-lock>
        <DialogHeader><DialogTitle className="flex items-center gap-2 font-display"><Radio className="h-5 w-5" />Sua Sintonia</DialogTitle></DialogHeader>
        <div className={cn("sintonia-preview flex items-center gap-3 rounded-lg bg-surface-2 p-4", `sintonia-${mood}`)}><span className="sintonia-aura"><UserAvatar avatarPath={me?.avatar_url} displayName={me?.display_name ?? "Você"} className="h-12 w-12" /></span><div className="min-w-0"><span className="text-2xl">{sintoniaMood(mood).emoji}</span><p className="mt-1 text-xs text-muted-foreground">{sintoniaMood(mood).label} · 24 horas</p></div></div>
        <label className="space-y-2"><span className="text-xs font-medium">Sua mensagem</span><textarea value={text} maxLength={SINTONIA_TEXT_MAX} onChange={(e) => setText(e.target.value)} placeholder="O que está na sua frequência?" aria-label="Mensagem da Sintonia" className="min-h-20 w-full resize-none rounded-lg border border-input bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /><span className="block text-right text-[10px] tabular-nums text-muted-foreground">{text.length}/{SINTONIA_TEXT_MAX}</span></label>
        <fieldset><legend className="mb-2 text-xs font-medium">Seu humor</legend><div className="grid grid-cols-3 gap-2">{SINTONIA_MOODS.map((m) => <Button key={m.id} variant={mood === m.id ? "secondary" : "ghost"} onClick={() => setMood(m.id)} aria-pressed={mood === m.id} className={cn("h-12 flex-col gap-0.5 rounded-lg text-[10px]", mood === m.id && "ring-1 ring-ring")}><span className="text-lg">{m.emoji}</span>{m.label}</Button>)}</div></fieldset>
        <div className="flex min-h-12 items-center gap-2 rounded-lg border border-border p-2">
          {draft || (keepAudio && mine?.audio_path) ? <><div className="min-w-0 flex-1">{draft ? <SintoniaDraftAudio file={draft.file} /> : mine?.audio_path ? <SintoniaAudio path={mine.audio_path} /> : null}</div><Button variant="ghost" size="icon" aria-label="Remover gravação" onClick={() => { setDraft(null); setKeepAudio(false); }}><Trash2 className="h-4 w-4" /></Button></> : <><AudioRecorder key={open ? "open" : "closed"} maxDurationMs={SINTONIA_AUDIO_MAX_MS} disabled={saving} onSend={(file, duration) => { setDraft({ file, duration }); setKeepAudio(false); }} /><span className="text-xs text-muted-foreground">Voz · até 10s</span></>}
        </div>
        <div className="flex gap-2">{mine && <Button variant="ghost" size="icon" disabled={saving} aria-label="Apagar Sintonia" onClick={() => void remove()} className="text-destructive"><Trash2 className="h-4 w-4" /></Button>}<Button className="flex-1 rounded-lg" disabled={saving || (!text.trim() && !draft && !keepAudio)} onClick={() => void save()}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Radio className="h-4 w-4" />}Publicar Sintonia</Button></div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!selected} onOpenChange={(value) => { if (!value && !replying) setSelected(null); }}>
      <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg p-5" data-swipe-lock>
        <DialogHeader><DialogTitle>Sintonia de {selected ? author(selected) : ""}</DialogTitle></DialogHeader>
        {selected && <><div className={cn("sintonia-preview flex items-center gap-3 rounded-lg bg-surface-2 p-4", `sintonia-${selected.mood}`)}><span className="sintonia-aura"><UserAvatar avatarPath={selected.profile?.avatar_url} displayName={author(selected)} className="h-12 w-12" /></span><div className="min-w-0"><span className="text-2xl">{sintoniaMood(selected.mood).emoji}</span><p className="text-xs text-muted-foreground">{sintoniaMood(selected.mood).label}</p></div></div><p className="break-words text-base font-medium">{selected.content}</p>{selected.audio_path && <SintoniaAudio path={selected.audio_path} />}<form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void sendReply(); }}><input value={reply} onChange={(e) => setReply(e.target.value)} maxLength={1000} placeholder="Responder no privado…" aria-label="Resposta à Sintonia" className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" /><Button type="submit" size="icon" aria-label="Enviar resposta" disabled={replying || !reply.trim()}>{replying ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}</Button></form></>}
      </DialogContent>
    </Dialog>
  </>;
}
