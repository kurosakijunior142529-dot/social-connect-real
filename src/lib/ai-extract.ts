/**
 * Extração de texto de arquivos no navegador (PDF, DOCX, TXT).
 * Roda apenas no cliente — nada disso é importado no servidor.
 */

export const AI_FILE_ACCEPT =
  ".pdf,.docx,.txt,.md,.csv,.json,image/*,application/pdf,text/plain";

export const MAX_AI_FILE_BYTES = 20 * 1024 * 1024;

export type ExtractedFile = {
  name: string;
  mime: string;
  size: number;
  kind: "image" | "document";
  text?: string;
  dataUrl?: string;
};

function isImage(file: File) {
  return file.type.startsWith("image/");
}

async function readAsDataUrl(file: File): Promise<string> {
  return await new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = () => reject(new Error("Não consegui ler o arquivo"));
    fr.readAsDataURL(file);
  });
}

async function extractPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist");
  const workerUrl = (await import("pdfjs-dist/build/pdf.worker.min.mjs?url")).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const buf = await file.arrayBuffer();
  const doc = await pdfjs.getDocument({ data: buf }).promise;
  const pages: string[] = [];
  const total = Math.min(doc.numPages, 60);
  for (let i = 1; i <= total; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const text = content.items.map((it: any) => ("str" in it ? it.str : "")).join(" ");
    pages.push(`--- Página ${i} ---\n${text}`);
  }
  await doc.destroy?.();
  return pages.join("\n\n");
}

async function extractDocx(file: File): Promise<string> {
  const mammoth: any = await import("mammoth/mammoth.browser");
  const buf = await file.arrayBuffer();
  const res = await mammoth.extractRawText({ arrayBuffer: buf });
  return String(res?.value ?? "");
}

export async function extractFile(file: File): Promise<ExtractedFile> {
  if (file.size > MAX_AI_FILE_BYTES) throw new Error("Arquivo muito grande (máx 20 MB)");

  const base = { name: file.name, mime: file.type || "application/octet-stream", size: file.size };

  if (isImage(file)) {
    return { ...base, kind: "image", dataUrl: await readAsDataUrl(file) };
  }

  const lower = file.name.toLowerCase();
  let text = "";
  if (file.type === "application/pdf" || lower.endsWith(".pdf")) {
    text = await extractPdf(file);
  } else if (lower.endsWith(".docx")) {
    text = await extractDocx(file);
  } else if (
    file.type.startsWith("text/") ||
    /\.(txt|md|csv|json|log|ts|tsx|js|html|css)$/.test(lower)
  ) {
    text = await file.text();
  } else {
    throw new Error("Formato não suportado. Envie PDF, DOCX, TXT ou imagem.");
  }

  text = text.replace(/\u0000/g, "").trim();
  if (!text) throw new Error("Não encontrei texto legível nesse arquivo.");
  return { ...base, kind: "document", text: text.slice(0, 120_000) };
}
