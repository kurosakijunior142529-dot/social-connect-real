import { useSignedUrl } from "@/hooks/use-signed-url";
import { signChatUrl, humanFileSize, formatDuration, type ChatBucket } from "@/lib/chat-media";
import { useQuery } from "@tanstack/react-query";
import { FileText, MapPin, Download, Play } from "lucide-react";
import { cn } from "@/lib/utils";

type Msg = {
  id: string;
  kind?: string | null;
  content?: string | null;
  media_url?: string | null;
  media_bucket?: string | null;
  media_type?: string | null;
  media_name?: string | null;
  media_size?: number | null;
  media_duration_ms?: number | null;
  meta?: any;
};

function useChatSigned(bucket: string | null | undefined, path: string | null | undefined) {
  return useQuery({
    queryKey: ["chat-signed", bucket ?? "", path ?? ""],
    queryFn: () => signChatUrl(bucket as ChatBucket, path!),
    enabled: !!bucket && !!path,
    staleTime: 30 * 60 * 1000,
  });
}

export function MessageBody({ msg, mine }: { msg: Msg; mine: boolean }) {
  const kind = msg.kind ?? "text";

  if (kind === "image") return <ImageBody msg={msg} />;
  if (kind === "video") return <VideoBody msg={msg} />;
  if (kind === "audio") return <AudioBody msg={msg} mine={mine} />;
  if (kind === "document") return <DocBody msg={msg} mine={mine} />;
  if (kind === "location") return <LocationBody msg={msg} />;
  return <span>{msg.content}</span>;
}

function ImageBody({ msg }: { msg: Msg }) {
  // legacy "posts" bucket path or new "chats"
  const bucket = msg.media_bucket || (msg.media_url?.startsWith("http") ? null : "chats");
  const signed = useSignedUrl(bucket as any, msg.media_url ?? null);
  const src = msg.media_url?.startsWith("http") ? msg.media_url : signed.data ?? null;
  if (!src) return <div className="w-56 h-40 rounded-xl bg-black/20 animate-pulse" />;
  return (
    <a href={src} target="_blank" rel="noreferrer" className="block">
      <img src={src} alt={msg.content ?? "imagem"} className="rounded-xl max-h-80 object-cover" />
      {msg.content ? <div className="mt-1 text-[13px]">{msg.content}</div> : null}
    </a>
  );
}

function VideoBody({ msg }: { msg: Msg }) {
  const signed = useChatSigned(msg.media_bucket, msg.media_url);
  const src = signed.data;
  if (!src) return <div className="w-56 h-40 rounded-xl bg-black/20 animate-pulse" />;
  return (
    <div>
      <video src={src} controls className="rounded-xl max-h-80 w-full" preload="metadata" />
      {msg.content ? <div className="mt-1 text-[13px]">{msg.content}</div> : null}
    </div>
  );
}

function AudioBody({ msg, mine }: { msg: Msg; mine: boolean }) {
  const signed = useChatSigned(msg.media_bucket, msg.media_url);
  const src = signed.data;
  return (
    <div className={cn("flex items-center gap-2 min-w-[180px]", mine ? "" : "")}>
      {src ? (
        <audio controls src={src} className="h-8 max-w-[220px]" />
      ) : (
        <div className="h-9 w-9 rounded-full bg-white/10 grid place-items-center">
          <Play className="h-4 w-4" />
        </div>
      )}
      <span className="text-[11px] opacity-70 tabular-nums">
        {formatDuration(msg.media_duration_ms ?? 0)}
      </span>
    </div>
  );
}

function DocBody({ msg, mine }: { msg: Msg; mine: boolean }) {
  const signed = useChatSigned(msg.media_bucket, msg.media_url);
  const src = signed.data;
  return (
    <a
      href={src ?? "#"}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex items-center gap-3 min-w-[220px] max-w-[280px] rounded-xl px-3 py-2",
        mine ? "bg-black/15" : "bg-black/20",
      )}
    >
      <div className="h-10 w-10 rounded-lg bg-primary/20 grid place-items-center shrink-0">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium truncate">{msg.media_name ?? "documento"}</div>
        <div className="text-[11px] opacity-70">{humanFileSize(msg.media_size)}</div>
      </div>
      <Download className="h-4 w-4 opacity-70 shrink-0" />
    </a>
  );
}

function LocationBody({ msg }: { msg: Msg }) {
  const lat = msg.meta?.lat as number | undefined;
  const lng = msg.meta?.lng as number | undefined;
  if (lat == null || lng == null) return <span>📍 localização</span>;
  const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  const img = `https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lng}&zoom=15&size=280x160&markers=${lat},${lng},red-pushpin`;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="block">
      <img
        src={img}
        alt="localização"
        onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
        className="rounded-xl w-[280px] max-w-full"
      />
      <div className="mt-1 flex items-center gap-1 text-[12px] opacity-80">
        <MapPin className="h-3 w-3" /> {lat.toFixed(4)}, {lng.toFixed(4)}
      </div>
    </a>
  );
}
