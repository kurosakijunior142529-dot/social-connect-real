import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Play } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

export function CallVoicePicker({ language }: { language: string }) {
  const [value, setValue] = useState("auto");
  const [devices, setDevices] = useState<SpeechSynthesisVoice[]>([]);
  const [busy, setBusy] = useState(false);
  const speak = useServerFn(speakCallTranslation);

  useEffect(() => {
    setValue(getCallVoice());
    const load = () => setDevices(deviceVoicesFor(language).slice(0, 12));
    load();
    window.speechSynthesis?.addEventListener?.("voiceschanged", load);
    return () => window.speechSynthesis?.removeEventListener?.("voiceschanged", load);
  }, [language]);

  const sample = SAMPLE[language.split("-")[0]!] ?? SAMPLE.en!;

  function test() {
    if (value.startsWith("ai:")) {
      setBusy(true);
      void speak({ data: { text: sample, voice: value.slice(3) } })
        .then((r: { audio: string; mime: string }) => new Audio(`data:${r.mime};base64,${r.audio}`).play())
        .catch(() => {})
        .finally(() => setBusy(false));
      return;
    }
    try {
      const synth = window.speechSynthesis;
      synth.cancel();
      const u = new SpeechSynthesisUtterance(sample);
      u.lang = language;
      const v = value.startsWith("device:") ? synth.getVoices().find((x) => x.voiceURI === value.slice(7)) : devices[0];
      if (v) u.voice = v;
      synth.speak(u);
    } catch { /* noop */ }
  }

  return (
    <div className="flex items-center gap-2">
      <Select value={value} onValueChange={(v) => { setValue(v); setCallVoice(v); }}>
        <SelectTrigger className="h-11 flex-1 rounded-2xl border-white/[0.07] bg-white/[0.04] text-[14px] text-white/80">
          <SelectValue placeholder="Voz" />
        </SelectTrigger>
        <SelectContent className="z-[130] max-h-72">
          <SelectItem value="auto">✨ Melhor voz do aparelho (grátis)</SelectItem>
          {devices.map((v) => (
            <SelectItem key={v.voiceURI} value={`device:${v.voiceURI}`}>📱 {v.name}</SelectItem>
          ))}
          {AI_VOICES.map((v) => (
            <SelectItem key={v.id} value={`ai:${v.id}`}>🎙️ {v.label} · {v.desc}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <button
        type="button"
        onClick={test}
        disabled={busy}
        aria-label="Testar voz"
        className="grid h-11 w-11 place-items-center rounded-2xl border border-white/[0.07] bg-white/[0.04] text-primary active:scale-95 disabled:opacity-50"
      >
        <Play className="h-4 w-4" />
      </button>
    </div>
  );
}
