import { useEffect, useRef, useState } from "react";
import { Drawer, DrawerContent, DrawerTitle } from "@/components/ui/drawer";
import { Plus, Image as ImageIcon, Film, FileText, MapPin, Sticker, Camera, X, Send, Footprints } from "lucide-react";
import { toast } from "sonner";

const MAX_MB = 50;

function formatSize(n: number) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function AttachMenu({
  onFile,
  onLocation,
  onOpenGifs,
  onRun,
  disabled,
}: {
  onFile: (file: File, caption?: string) => void | Promise<void>;
  onLocation: (coords: { lat: number; lng: number }) => void | Promise<void>;
  onOpenGifs?: () => void;
  onRun?: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [caption, setCaption] = useState("");
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pending || !(pending.type.startsWith("image/") || pending.type.startsWith("video/"))) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(pending);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pending]);

  function pick(input: React.RefObject<HTMLInputElement | null>) {
    input.current?.click();
  }

  function handle(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    if (f.size > MAX_MB * 1024 * 1024) {
      toast.error(`Arquivo maior que ${MAX_MB}MB`);
      return;
    }
    setCaption("");
    setPending(f);
    setOpen(true);
  }

  function shareLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocalização não suportada");
      return;
    }
    setOpen(false);
    toast.loading("Obtendo localização…", { id: "geo" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        toast.dismiss("geo");
        onLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        toast.dismiss("geo");
        toast.error(err.message ?? "Falha ao obter localização");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  function send() {
    if (!pending) return;
    const f = pending;
    const c = caption.trim();
    setPending(null);
    setOpen(false);
    navigator.vibrate?.(10);
    onFile(f, c || undefined);
  }

  const items: { label: string; hint: string; icon: React.ReactNode; onClick: () => void }[] = [
    { label: "Galeria", hint: "Fotos", icon: <ImageIcon className="h-5 w-5" />, onClick: () => pick(photo) },
    { label: "Câmera", hint: "Tirar agora", icon: <Camera className="h-5 w-5" />, onClick: () => pick(camera) },
    { label: "Vídeo", hint: `Até ${MAX_MB}MB`, icon: <Film className="h-5 w-5" />, onClick: () => pick(video) },
    { label: "Documento", hint: "PDF, planilhas…", icon: <FileText className="h-5 w-5" />, onClick: () => pick(doc) },
    { label: "Localização", hint: "Com mapa", icon: <MapPin className="h-5 w-5" />, onClick: shareLocation },
    ...(onRun ? [{ label: "Corrida", hint: "Em dupla", icon: <Footprints className="h-5 w-5" />, onClick: () => { setOpen(false); onRun(); } }] : []),
    ...(onOpenGifs
      ? [{ label: "GIF", hint: "Animados", icon: <Sticker className="h-5 w-5" />, onClick: () => { setOpen(false); onOpenGifs(); } }]
      : []),
  ];

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        aria-label="Anexar"
        onClick={() => { setPending(null); setOpen(true); }}
        className="grid h-9 w-9 place-items-center rounded-full transition active:scale-90 active:bg-[color:var(--surface-2)] disabled:opacity-40"
      >
        <Plus className="h-[20px] w-[20px]" strokeWidth={1.8} />
      </button>

      <Drawer open={open} onOpenChange={(o) => { setOpen(o); if (!o) setPending(null); }}>
        <DrawerContent className="pb-[max(env(safe-area-inset-bottom),1rem)]">
          <DrawerTitle className="sr-only">{pending ? "Pré-visualizar anexo" : "Enviar arquivo"}</DrawerTitle>
          {!pending ? (
            <div className="px-4 pt-2">
              <div className="mb-3 text-sm font-semibold">Enviar</div>
              <div className="grid grid-cols-3 gap-2">
                {items.map((it) => (
                  <button
                    key={it.label}
                    type="button"
                    onClick={it.onClick}
                    className="flex flex-col items-center gap-2 rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)] px-2 py-4 transition active:scale-95 hover:bg-[color:var(--surface-2)]"
                  >
                    <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[color:var(--surface-2)] text-foreground">
                      {it.icon}
                    </div>
                    <div className="text-center leading-tight">
                      <div className="text-xs font-medium">{it.label}</div>
                      <div className="text-[10px] text-muted-foreground">{it.hint}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-3 px-4 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-semibold">Pré-visualizar</div>
                <button type="button" onClick={() => setPending(null)} aria-label="Trocar arquivo" className="grid h-8 w-8 place-items-center rounded-full bg-[color:var(--surface-2)]">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="grid max-h-[50vh] place-items-center overflow-hidden rounded-2xl border border-[color:var(--hairline)] bg-[color:var(--surface)]">
                {preview && pending.type.startsWith("image/") ? (
                  <img src={preview} alt="" className="max-h-[50vh] w-full object-contain" />
                ) : preview && pending.type.startsWith("video/") ? (
                  <video src={preview} controls playsInline className="max-h-[50vh] w-full" />
                ) : (
                  <div className="flex w-full items-center gap-3 p-4">
                    <div className="grid h-12 w-12 place-items-center rounded-xl bg-[color:var(--surface-2)]"><FileText className="h-5 w-5" /></div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{pending.name}</div>
                      <div className="text-xs text-muted-foreground">{formatSize(pending.size)}</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-2">
                <input
                  value={caption}
                  onChange={(e) => setCaption(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && send()}
                  placeholder="Adicionar legenda…"
                  className="h-11 flex-1 rounded-full border border-[color:var(--hairline)] bg-[color:var(--surface)] px-4 text-sm outline-none focus:border-primary/50"
                />
                <button type="button" onClick={send} aria-label="Enviar" className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-90">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </DrawerContent>
      </Drawer>

      <input ref={photo} type="file" accept="image/*" hidden onChange={handle} />
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={handle} />
      <input ref={video} type="file" accept="video/*" hidden onChange={handle} />
      <input ref={doc} type="file" hidden onChange={handle} />
    </>
  );
}
