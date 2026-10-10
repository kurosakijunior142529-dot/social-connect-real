import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Loader2, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { speakCallTranslation } from "@/lib/call-speech.functions";
import { AI_VOICES, deviceVoicesFor, getCallVoice, setCallVoice } from "@/lib/call-voice";

const SAMPLE: Record<string, string> = {
  pt: "Olá! Essa é a voz da sua tradução.",
  en: "Hi! This is your translation voice.",
  es: "¡Hola! Esta es la voz de tu traducción.",
  fr: "Bonjour ! Voici la voix de votre traduction.",
  de: "Hallo! Das ist deine Übersetzungsstimme.",
  it: "Ciao! Questa è la voce della tua traduzione.",
};

type DeviceVoice = { uri: string; name: string };
type Item = { value: string; label: string; desc?: string };

export function CallVoicePicker({ language }: { language: string }) {
  const [value, setValue] = useState("auto");
  const [tab, setTab] = useState<"ai" | "device">("device");
  const [gender, setGender] = useState<"all" | "m" | "f">("all");
  const [devices, setDevices] = useState<DeviceVoice[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const reqRef = useRef(0);
  const speak = useServerFn(speakCallTranslation);

  useEffect(() => {
    const v = getCallVoice();
    setValue(v);
    if (v.startsWith("ai:")) setTab("ai");
  }, []);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let lastKey = "";
    const load = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const list = deviceVoicesFor(language).slice(0, 12).map((v) => ({ uri: v.voiceURI, name: v.name }));
        const key = list.map((v) => v.uri).join("|");
        if (key === lastKey) return;
        lastKey = key;
        setDevices(list);
      }, 150);
    };
    load();
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    synth?.addEventListener?.("voiceschanged", load);
    return () => {
      clearTimeout(timer);
      synth?.removeEventListener?.("voiceschanged", load);
    };
  }, [language]);

  useEffect(() => () => stopAll(), []);

  function stopAll() {
    reqRef.current++;
    try { window.speechSynthesis?.cancel(); } catch { /* noop */ }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
  }

  const sample = SAMPLE[language.split("-")[0]!] ?? SAMPLE.en!;

  function choose(v: string) {
    setValue(v);
    setCallVoice(v);
    try { navigator.vibrate?.(6); } catch { /* noop */ }
  }

  function test(v: string) {
    if (busy) { stopAll(); setBusy(null); if (busy === v) return; }
    stopAll();
    choose(v);
    if (v.startsWith("ai:")) {
      const id = ++reqRef.current;
      setBusy(v);
      void speak({ data: { text: sample, voice: v.slice(3) } })
        .then((r: { audio: string; mime: string }) => {
          if (id !== reqRef.current) return;
          const a = audioRef.current ?? new Audio();
          audioRef.current = a;
          a.src = `data:${r.mime};base64,${r.audio}`;
          void a.play().catch(() => {});
        })
        .catch(() => {})
        .finally(() => { if (id === reqRef.current) setBusy(null); });
      return;
    }
    setBusy(null);
    try {
      const synth = window.speechSynthesis;
      const u = new SpeechSynthesisUtterance(sample);
      u.lang = language;
      const uri = v.startsWith("device:") ? v.slice(7) : devices[0]?.uri;
      const voice = uri ? synth.getVoices().find((x) => x.voiceURI === uri) : undefined;
      if (voice) u.voice = voice;
      synth.speak(u);
    } catch { /* noop */ }
  }

  const items: Item[] =
    tab === "ai"
      ? AI_VOICES.filter((v) => gender === "all" || v.g === gender).map((v) => ({ value: `ai:${v.id}`, label: v.label, desc: v.desc }))
      : [
          { value: "auto", label: "Melhor voz do aparelho", desc: "Grátis" },
          ...devices.map((v) => ({ value: `device:${v.uri}`, label: v.name, desc: "Grátis" })),
        ];

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-white/[0.04] p-1">
        {(["device", "ai"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "h-9 rounded-xl text-[13px] font-medium transition",
              tab === t ? "bg-white/[0.1] text-white" : "text-white/50",
            )}
          >
            {t === "device" ? "📱 Do celular" : "🎙️ Vozes de IA"}
          </button>
        ))}
      </div>
      {tab === "ai" ? (
        <div className="flex gap-1.5">
          {([["all", "Todas"], ["m", "👨 Masculinas"], ["f", "👩 Femininas"]] as const).map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setGender(k)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] transition",
                gender === k ? "bg-white/[0.12] font-semibold text-white" : "text-white/50",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      ) : null}
      <div className="max-h-64 space-y-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]">
        {items.map((it) => {
          const selected = value === it.value;
          return (
            <div
              key={it.value}
              className={cn(
                "flex items-center gap-2 rounded-2xl border px-3 py-2",
                selected ? "border-primary/40 bg-primary/10" : "border-white/[0.06] bg-white/[0.03]",
              )}
            >
              <button type="button" onClick={() => choose(it.value)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] text-white/85">{it.label}</span>
                  {it.desc ? <span className="block text-[11px] text-white/40">{it.desc}</span> : null}
                </span>
                {selected ? <Check className="h-4 w-4 shrink-0 text-primary" /> : null}
              </button>
              <button
                type="button"
                onClick={() => test(it.value)}
                aria-label={`Ouvir ${it.label}`}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/[0.06] text-primary active:scale-95"
              >
                {busy === it.value ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              </button>
            </div>
          );
        })}
        {tab === "device" && devices.length === 0 ? (
          <p className="px-2 py-1 text-[12px] text-white/40">Seu celular não mostrou outras vozes para esse idioma.</p>
        ) : null}
      </div>
    </div>
  );
}
