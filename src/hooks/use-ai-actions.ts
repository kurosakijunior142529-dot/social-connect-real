import { useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { translateText, summarizeConversation, aiAsk, smartReplies } from "@/lib/ai.functions";

export function useAiActions() {
  const translate = useServerFn(translateText);
  const summarize = useServerFn(summarizeConversation);
  const ask = useServerFn(aiAsk);
  const suggest = useServerFn(smartReplies);
  const [busy, setBusy] = useState(false);

  return {
    busy,
    async translate(text: string, target = "pt-BR") {
      setBusy(true);
      try {
        const r = await translate({ data: { text, target } });
        return r.text;
      } catch (e: any) {
        toast.error(e.message ?? "Falha na tradução");
        return null;
      } finally { setBusy(false); }
    },
    async summarize(scope: "chat" | "dm", id: string) {
      setBusy(true);
      try {
        const r = await summarize({ data: { scope, id, limit: 60 } });
        return r.summary;
      } catch (e: any) {
        toast.error(e.message ?? "Falha ao resumir");
        return null;
      } finally { setBusy(false); }
    },
    async ask(prompt: string) {
      setBusy(true);
      try {
        const r = await ask({ data: { prompt } });
        return r.text;
      } catch (e: any) {
        toast.error(e.message ?? "IA indisponível");
        return null;
      } finally { setBusy(false); }
    },
    async suggest(scope: "chat" | "dm", id: string) {
      try {
        const r = await suggest({ data: { scope, id } });
        return r.suggestions;
      } catch { return []; }
    },
  };
}
