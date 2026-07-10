import { useRef } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Paperclip, Image as ImageIcon, Film, FileText, MapPin, Sticker } from "lucide-react";
import { toast } from "sonner";

const MAX_MB = 50;

export function AttachMenu({
  onFile,
  onLocation,
  onOpenGifs,
  disabled,
}: {
  onFile: (file: File) => void | Promise<void>;
  onLocation: (coords: { lat: number; lng: number }) => void | Promise<void>;
  onOpenGifs?: () => void;
  disabled?: boolean;
}) {
  const photo = useRef<HTMLInputElement>(null);
  const video = useRef<HTMLInputElement>(null);
  const doc = useRef<HTMLInputElement>(null);

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
    onFile(f);
  }

  async function shareLocation() {
    if (!("geolocation" in navigator)) {
      toast.error("Geolocalização não suportada");
      return;
    }
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

  const items: { label: string; icon: React.ReactNode; onClick: () => void }[] = [
    { label: "Foto", icon: <ImageIcon className="h-5 w-5" />, onClick: () => pick(photo) },
    { label: "Vídeo", icon: <Film className="h-5 w-5" />, onClick: () => pick(video) },
    { label: "GIF", icon: <Sticker className="h-5 w-5" />, onClick: () => onOpenGifs?.() },
    { label: "Documento", icon: <FileText className="h-5 w-5" />, onClick: () => pick(doc) },
    { label: "Localização", icon: <MapPin className="h-5 w-5" />, onClick: shareLocation },
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Anexar"
          className="p-2 rounded-full active:bg-[color:var(--surface-2)] disabled:opacity-40"
        >
          <Paperclip className="h-[18px] w-[18px]" strokeWidth={1.8} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" className="w-64 p-2 glass border-white/10">
        <div className="grid grid-cols-3 gap-1">
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              onClick={it.onClick}
              className="flex flex-col items-center gap-1.5 rounded-xl px-2 py-3 hover:bg-white/10 transition"
            >
              <div className="h-9 w-9 rounded-full bg-primary/15 text-primary grid place-items-center">
                {it.icon}
              </div>
              <span className="text-[11px]">{it.label}</span>
            </button>
          ))}
        </div>
      </PopoverContent>
      <input ref={photo} type="file" accept="image/*" hidden onChange={handle} />
      <input ref={video} type="file" accept="video/*" hidden onChange={handle} />
      <input ref={doc} type="file" hidden onChange={handle} />
    </Popover>
  );
}

