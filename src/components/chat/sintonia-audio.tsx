import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { signChatUrl } from "@/lib/chat-media";
import { Loader2, VolumeX } from "lucide-react";

export function SintoniaAudio({ path }: { path: string }) {
  const [failed, setFailed] = useState(false);
  const audio = useQuery({
    queryKey: ["sintonia-audio", path],
    queryFn: () => signChatUrl("chat-audio", path, 60),
    staleTime: 45_000,
    gcTime: 60_000,
  });
  if (audio.isPending) return <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="Carregando áudio" />;
  if (!audio.data || failed) return <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground"><VolumeX className="h-4 w-4" />Áudio indisponível</p>;
  return <audio controls preload="metadata" src={audio.data} onError={() => setFailed(true)} aria-label="Ouvir Sintonia" className="h-10 w-full min-w-0" />;
}

export function SintoniaDraftAudio({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);
  return <audio controls src={url} className="h-10 w-full min-w-0" aria-label="Ouvir gravação" />;
}