/**
 * End screen oficial do Vibely gravada no arquivo de vídeo baixado.
 *
 * A arte é usada EXATAMENTE como fornecida (imagem oficial em
 * `/end-screen.png`). Nada é recriado, redesenhado ou gerado: o único
 * elemento dinâmico é o @username do autor, digitado dentro do campo de
 * busca que já existe na arte.
 */

/** Caminho da arte oficial (asset do sistema, servido estaticamente). */
export const END_SCREEN_ASSET = "/end-screen.png";

/** Duração total da end screen, em segundos. */
export const END_SCREEN_SECONDS = 3.2;

/**
 * Posição do campo de busca DENTRO da arte oficial, em coordenadas
 * normalizadas (0..1) relativas à própria imagem. Ajustável sem tocar no
 * resto do sistema caso a arte seja atualizada.
 */
export const SEARCH_FIELD_RECT = { x: 0.151, y: 0.652, w: 0.7, h: 0.059 };

export type EndScreenArt = HTMLImageElement;

let cached: Promise<EndScreenArt | null> | null = null;

/** Carrega (e memoiza) a arte oficial. Retorna null se o asset não existir. */
export function loadEndScreenArt(src: string = END_SCREEN_ASSET): Promise<EndScreenArt | null> {
  if (cached) return cached;
  cached = new Promise<EndScreenArt | null>((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => {
      console.warn("[end-screen] arte oficial não encontrada em", src);
      resolve(null);
    };
    img.src = src;
  });
  return cached;
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/**
 * Desenha um frame da end screen.
 *
 * @param t tempo decorrido da end screen, em segundos
 * @returns false quando a animação terminou
 */
export function drawEndScreenFrame(
  ctx: CanvasRenderingContext2D,
  art: EndScreenArt,
  w: number,
  h: number,
  username: string,
  t: number,
): boolean {
  const total = END_SCREEN_SECONDS;
  const handle = username.startsWith("@") ? username : `@${username}`;

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, w, h);

  // fade-in rápido + fade-out no final
  const fadeIn = Math.min(1, t / 0.35);
  const fadeOut = t > total - 0.4 ? Math.max(0, (total - t) / 0.4) : 1;
  ctx.globalAlpha = easeOut(fadeIn) * fadeOut;

  // zoom suave de 105% -> 100%
  const zoom = 1.05 - 0.05 * easeOut(Math.min(1, t / 0.6));

  // A end screen NÃO herda o enquadramento do vídeo. O fundo sempre cobre
  // 100% do quadro e a arte oficial aparece inteira por cima, centralizada.
  // Assim não há barras pretas nem corte do mascote, logo ou campo de busca,
  // inclusive quando o vídeo original é horizontal ou quadrado.
  const coverScale = Math.max(w / art.naturalWidth, h / art.naturalHeight);
  const coverW = art.naturalWidth * coverScale;
  const coverH = art.naturalHeight * coverScale;
  const coverX = (w - coverW) / 2;
  const coverY = (h - coverH) / 2;
  const containScale = Math.min(w / art.naturalWidth, h / art.naturalHeight);
  const aw = art.naturalWidth * containScale;
  const ah = art.naturalHeight * containScale;
  const ax = (w - aw) / 2;
  const ay = (h - ah) / 2;

  ctx.translate(w / 2, h / 2);
  ctx.scale(zoom, zoom);
  ctx.translate(-w / 2, -h / 2);
  // Fundo ampliado da própria arte, suavizado, ocupa a tela inteira.
  ctx.save();
  (ctx as any).filter = `blur(${Math.max(18, Math.round(Math.min(w, h) * 0.035))}px) brightness(0.58) saturate(1.08)`;
  ctx.drawImage(art, coverX, coverY, coverW, coverH);
  ctx.restore();

  // Arte oficial inteira, sem recorte e sem deformação.
  ctx.drawImage(art, ax, ay, aw, ah);

  // brilho verde muito sutil (respiração), sem adicionar elementos novos
  const breathe = 0.05 + 0.03 * Math.sin((t / total) * Math.PI * 2);
  ctx.globalCompositeOperation = "lighter";
  const glow = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.65);
  glow.addColorStop(0, `rgba(34, 224, 106, ${breathe})`);
  glow.addColorStop(1, "rgba(34, 224, 106, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "source-over";

  // ---- campo de busca: @username digitado dinamicamente ----
  const f = SEARCH_FIELD_RECT;
  const fx = ax + f.x * aw;
  const fy = ay + f.y * ah;
  const fw = f.w * aw;
  const fh = f.h * ah;

  const typeStart = 1.0;
  const typeDur = Math.max(0.5, Math.min(1.1, handle.length * 0.075));
  const typed =
    t < typeStart
      ? ""
      : handle.slice(0, Math.ceil(Math.min(1, (t - typeStart) / typeDur) * handle.length));
  const typingDone = t >= typeStart + typeDur;

  if (typed) {
    let fontSize = Math.max(10, fh * 0.56);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `700 ${fontSize}px "Space Grotesk", "DM Sans", system-ui, sans-serif`;
    // nunca deixa o @ encostar na lupa nem no ícone da direita
    const maxWidth = fw * 0.66;
    const full = ctx.measureText(handle).width;
    if (full > maxWidth) {
      fontSize = fontSize * (maxWidth / full);
      ctx.font = `700 ${fontSize}px "Space Grotesk", "DM Sans", system-ui, sans-serif`;
    }
    const cx = fx + fw / 2;
    const cy = fy + fh / 2;
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = "rgba(34, 224, 106, 0.6)";
    ctx.shadowBlur = fontSize * 0.55;
    ctx.fillText(typed, cx, cy);
    ctx.shadowBlur = 0;

    // cursor piscando enquanto digita
    if (!typingDone && Math.floor(t * 6) % 2 === 0) {
      const cw = Math.max(1.5, fontSize * 0.08);
      ctx.fillStyle = "rgba(34, 224, 106, 0.9)";
      ctx.fillRect(cx + ctx.measureText(typed).width / 2 + fontSize * 0.16, cy - fh * 0.24, cw, fh * 0.48);
    }
  }

  // confirmação/busca: anel verde curto ao redor do campo
  const confirmAt = typeStart + typeDur;
  if (t >= confirmAt && t <= confirmAt + 0.5) {
    const p = (t - confirmAt) / 0.5;
    const grow = fh * 0.45 * easeOut(p);
    ctx.strokeStyle = `rgba(34, 224, 106, ${0.7 * (1 - p)})`;
    ctx.lineWidth = Math.max(1.5, fh * 0.07);
    ctx.shadowColor = "rgba(34, 224, 106, 0.8)";
    ctx.shadowBlur = fh * 0.6 * (1 - p);
    const r = fh / 2 + grow;
    const rx = fx - grow;
    const ry = fy - grow;
    const rw = fw + grow * 2;
    const rh = fh + grow * 2;
    ctx.beginPath();
    if (typeof ctx.roundRect === "function") ctx.roundRect(rx, ry, rw, rh, r);
    else ctx.rect(rx, ry, rw, rh);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
  return t < total;
}
