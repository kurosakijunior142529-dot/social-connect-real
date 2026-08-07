const STT_MODEL = "openai/gpt-4o-mini-transcribe";
const ENDPOINT = "https://ai.gateway.lovable.dev/v1/audio/transcriptions";

function normalizeLang(input?: string | null): string | undefined {
  if (!input) return undefined;
  const base = input.split("-")[0]?.toLowerCase();
  return base && /^[a-z]{2}$/.test(base) ? base : undefined;
}

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const output = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
}

export async function transcribeCallAudio(audio: string, language?: string): Promise<string> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("Transcrição indisponível no momento.");

  const bytes = base64ToBytes(audio);
  const form = new FormData();
  form.append("model", STT_MODEL);
  form.append("file", new Blob([bytes], { type: "audio/wav" }), "clip.wav");
  const normalizedLanguage = normalizeLang(language);
  if (normalizedLanguage) form.append("language", normalizedLanguage);

  let response: Response;
  try {
    response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });
  } catch (error) {
    console.error("[call-stt] network failure", error);
    throw new Error("Sem conexão com o serviço de transcrição.");
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("[call-stt] gateway error", response.status, detail.slice(0, 400));
    if (response.status === 402) throw new Error("Créditos de IA esgotados.");
    if (response.status === 429) throw new Error("Muitas transcrições seguidas. Aguarde um instante.");
    if (response.status === 403 || response.status === 404) {
      throw new Error("Transcrição por IA não está habilitada nesta conta.");
    }
    throw new Error("Não foi possível transcrever o áudio.");
  }

  const payload = (await response.json().catch(() => null)) as { text?: string } | null;
  return (payload?.text ?? "").trim();
}