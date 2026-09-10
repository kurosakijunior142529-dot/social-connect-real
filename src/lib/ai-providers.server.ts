/**
 * Provedores oficiais de geração (somente servidor).
 *
 * Arquitetura: o Vibely cobra os SEUS créditos internos (tabela `user_coins`)
 * e chama diretamente a API oficial do modelo escolhido:
 *  - Veo 3.1 / imagens  → Google Generative Language API (GOOGLE_AI_API_KEY)
 *  - Seedance 2.5       → BytePlus ModelArk (BYTEPLUS_ARK_API_KEY)
 *
 * Nenhuma dessas chamadas passa pelo gateway de IA da Lovable, e nenhuma chave
 * sai do backend.
 */

const GOOGLE_BASE = "https://generativelanguage.googleapis.com/v1beta";

export const ARK_BASE =
  process.env["BYTEPLUS_ARK_BASE_URL"] || "https://ark.ap-southeast.bytepluses.com/api/v3";

export function googleKey() {
  const key = process.env["GOOGLE_AI_API_KEY"];
  if (!key) {
    throw new Error(
      "A geração pelo Google (Veo 3.1 / imagens) ainda não está configurada neste app. Peça ao administrador para adicionar a chave do Google AI.",
    );
  }
  return key;
}

export function arkKey() {
  const key = process.env["BYTEPLUS_ARK_API_KEY"];
  if (!key) {
    throw new Error(
      "O Seedance 2.5 ainda não está configurado neste app. Use o Veo 3.1 ou peça ao administrador para adicionar a chave da BytePlus.",
    );
  }
  return key;
}

export function hasGoogleKey() {
  return Boolean(process.env["GOOGLE_AI_API_KEY"]);
}

export function hasArkKey() {
  return Boolean(process.env["BYTEPLUS_ARK_API_KEY"]);
}

/** Mensagem amigável a partir do status HTTP do provedor externo. */
export function friendlyProviderError(status: number, body: string) {
  console.error("[ai-provider] error", status, body.slice(0, 500));
  if (status === 401 || status === 403) return "A chave de acesso do modelo foi recusada.";
  if (status === 402) return "A conta do modelo de IA está sem saldo. Avise o administrador.";
  if (status === 429) {
    return body.includes("quota") || body.includes("RESOURCE_EXHAUSTED")
      ? "A cota da conta de IA acabou. Avise o administrador para liberar o faturamento do modelo de vídeo."
      : "Muitos pedidos agora. Tente de novo em instantes.";
  }
  if (status === 400) return "Não consegui gerar com essa descrição. Tente descrever de outro jeito.";
  return "Não foi possível gerar agora.";
}

export const GOOGLE_VIDEO_MODEL = process.env["GOOGLE_VEO_MODEL"] || "veo-3.1-generate-preview";
export const GOOGLE_IMAGE_MODEL = process.env["GOOGLE_IMAGE_MODEL"] || "gemini-2.5-flash-image";

type VeoStart = {
  prompt: string;
  negativePrompt?: string | undefined;
  seconds: number;
  resolution: string;
  aspectRatio: string;
  generateAudio: boolean;
  image?: { base64: string; mimeType: string } | undefined;
};

/** Cria a operação de vídeo no Veo. Devolve o nome da operação (job id). */
export async function veoStart(opts: VeoStart): Promise<{ ok: true; jobId: string } | { ok: false; status: number; body: string }> {
  const instance: Record<string, unknown> = { prompt: opts.prompt };
  if (opts.image) instance["image"] = { bytesBase64Encoded: opts.image.base64, mimeType: opts.image.mimeType };

  const parameters: Record<string, unknown> = {
    durationSeconds: opts.seconds,
    resolution: opts.resolution,
    sampleCount: 1,
    generateAudio: opts.generateAudio,
  };
  // O Veo deduz a orientação a partir da imagem de referência.
  if (!opts.image) parameters["aspectRatio"] = opts.aspectRatio;
  if (opts.negativePrompt) parameters["negativePrompt"] = opts.negativePrompt;

  const send = async () =>
    fetch(`${GOOGLE_BASE}/models/${GOOGLE_VIDEO_MODEL}:predictLongRunning`, {
      method: "POST",
      headers: { "x-goog-api-key": googleKey(), "Content-Type": "application/json" },
      body: JSON.stringify({ instances: [instance], parameters }),
    });

  let res = await send();
  // Algumas versões do modelo não aceitam certos parâmetros opcionais
  // (ex.: `generateAudio`). Nesse caso removemos o parâmetro citado e repetimos.
  for (let attempt = 0; attempt < 3 && res.status === 400; attempt++) {
    const body = await res.clone().text().catch(() => "");
    const unsupported = ["generateAudio", "resolution", "negativePrompt", "aspectRatio"].find(
      (p) => body.includes(`\`${p}\``) && p in parameters,
    );
    if (!unsupported) break;
    delete parameters[unsupported];
    res = await send();
  }

  if (!res.ok) return { ok: false, status: res.status, body: await res.text().catch(() => "") };
  const json = (await res.json()) as { name?: string };
  if (!json.name) return { ok: false, status: 502, body: "operação sem nome" };
  return { ok: true, jobId: json.name };
}

export type VeoPoll =
  | { state: "processing" }
  | { state: "failed"; detail: string }
  | { state: "done"; bytes: Uint8Array };

/** Consulta a operação do Veo e baixa o MP4 quando estiver pronta. */
export async function veoPoll(jobId: string): Promise<VeoPoll> {
  const key = googleKey();
  const res = await fetch(`${GOOGLE_BASE}/${jobId}`, { headers: { "x-goog-api-key": key } });
  if (!res.ok) {
    console.error("[ai-provider] veo poll failed", res.status);
    return { state: "processing" };
  }
  const op = (await res.json()) as any;
  if (op?.error?.message) return { state: "failed", detail: String(op.error.message) };
  if (!op?.done) return { state: "processing" };

  const sample =
    op?.response?.generateVideoResponse?.generatedSamples?.[0] ??
    op?.response?.generatedVideos?.[0] ??
    op?.response?.videos?.[0];
  const uri: string | undefined = sample?.video?.uri ?? sample?.uri ?? sample?.video?.url;
  const inline: string | undefined = sample?.video?.bytesBase64Encoded ?? sample?.bytesBase64Encoded;

  if (inline) return { state: "done", bytes: base64ToBytes(inline) };
  if (!uri) return { state: "failed", detail: "a API não devolveu o vídeo" };

  const dl = await fetch(uri, { headers: { "x-goog-api-key": key } });
  if (!dl.ok) {
    console.error("[ai-provider] veo download failed", dl.status);
    return { state: "processing" };
  }
  return { state: "done", bytes: new Uint8Array(await dl.arrayBuffer()) };
}

/** Gera uma imagem no Google e devolve os bytes PNG. */
export async function googleImage(
  prompt: string,
): Promise<{ ok: true; bytes: Uint8Array; mimeType: string } | { ok: false; status: number; body: string }> {
  const res = await fetch(`${GOOGLE_BASE}/models/${GOOGLE_IMAGE_MODEL}:generateContent`, {
    method: "POST",
    headers: { "x-goog-api-key": googleKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: prompt }] }] }),
  });
  if (!res.ok) return { ok: false, status: res.status, body: await res.text().catch(() => "") };
  const json = (await res.json()) as any;
  const parts: any[] = json?.candidates?.[0]?.content?.parts ?? [];
  const media = parts.find((p) => p?.inlineData?.data ?? p?.inline_data?.data);
  const inline = media?.inlineData ?? media?.inline_data;
  if (!inline?.data) return { ok: false, status: 502, body: "sem imagem na resposta" };
  return { ok: true, bytes: base64ToBytes(inline.data), mimeType: inline.mimeType ?? inline.mime_type ?? "image/png" };
}

export function base64ToBytes(b64: string) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
