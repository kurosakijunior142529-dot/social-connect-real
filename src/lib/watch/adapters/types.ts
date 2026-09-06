// Arquitetura multi-provider do Streaming Amigo.
// O YouTube usa o player já existente; os demais serviços são pontos de
// integração preparados para uma integração oficial/licenciada.

export type StreamingProvider = "youtube" | "twitch" | "prime" | "netflix" | "disney";

export interface WatchPartyState {
  roomId: string;
  hostId: string;
  provider: StreamingProvider;
  contentId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  volume: number;
  createdAt: string;
}

export interface WatchContentMeta {
  provider: StreamingProvider;
  contentId: string | null;
  title?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
}

export interface StreamingProviderAdapter {
  provider: StreamingProvider;
  /** true quando o adapter consegue realmente reproduzir neste dispositivo. */
  readonly playable: boolean;
  /** Mensagem exibida quando não há integração oficial disponível. */
  readonly unavailableMessage?: string;
  /** Integração oficial/licenciada necessária para reprodução embutida. */
  readonly requirement?: string;

  initialize(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  isPlaying(): boolean;
  destroy(): Promise<void>;
}

export const PROVIDER_LABEL: Record<StreamingProvider, string> = {
  youtube: "YouTube",
  twitch: "Twitch",
  prime: "Prime Video",
  netflix: "Netflix",
  disney: "Disney+",
};

/** Serviços exibidos no seletor da sala. */
export const PROVIDER_OPTIONS: StreamingProvider[] = ["youtube", "prime", "netflix", "disney"];

/** Serviços pagos: cada participante assiste na própria conta/assinatura. */
export const PREMIUM_PROVIDERS: StreamingProvider[] = ["prime", "netflix", "disney"];
