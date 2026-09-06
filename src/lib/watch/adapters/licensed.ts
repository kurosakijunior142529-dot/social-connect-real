// Integrações de reprodução para serviços com DRM (Prime Video, Netflix, Disney+).
//
// Regras desta camada:
// - nada aqui captura tela, baixa conteúdo, remove DRM ou retransmite vídeo;
// - nada aqui abre navegador externo, aplicativo externo ou deep link;
// - a reprodução só acontece se houver um SDK oficial/licenciado registrado
//   pelo serviço; enquanto não houver, a área do player permanece reservada
//   dentro da sala com a mensagem técnica correspondente.
//
// Para habilitar um serviço basta registrar o SDK oficial (após licenciamento
// com o detentor do conteúdo) via `registerLicensedSdk`.

import type { StreamingProvider, StreamingProviderAdapter } from "./types";
import { PROVIDER_LABEL } from "./types";

/** Contrato que um SDK oficial/licenciado precisa cumprir para tocar na sala. */
export interface LicensedPlaybackSdk {
  mount(container: HTMLElement, contentId: string | null): Promise<void>;
  unmount(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  getCurrentTime(): Promise<number>;
  getDuration(): Promise<number>;
  isPlaying(): boolean;
}

const registry = new Map<StreamingProvider, LicensedPlaybackSdk>();

/**
 * Registra o SDK oficial de um serviço. Deve ser chamado apenas com um SDK
 * fornecido/autorizado pelo próprio serviço (contrato de licenciamento).
 */
export function registerLicensedSdk(provider: StreamingProvider, sdk: LicensedPlaybackSdk) {
  registry.set(provider, sdk);
}

export function getLicensedSdk(provider: StreamingProvider): LicensedPlaybackSdk | null {
  return registry.get(provider) ?? null;
}

/** Requisito técnico de cada serviço para reprodução embutida no Vibely. */
export const LICENSED_REQUIREMENT: Partial<Record<StreamingProvider, string>> = {
  prime: "Prime Video Partner Playback SDK (licença de distribuição da Amazon + app aprovado).",
  netflix: "Netflix Partner Playback SDK / dispositivo certificado pela Netflix.",
  disney: "Disney+ Partner Integration SDK (licença de distribuição da Disney).",
};

export interface LicensedIntegration {
  provider: StreamingProvider;
  /** true somente quando existe SDK oficial licenciado registrado. */
  isAvailable(): Promise<boolean>;
  sdk(): LicensedPlaybackSdk | null;
}

function createIntegration(provider: StreamingProvider): LicensedIntegration {
  return {
    provider,
    async isAvailable() {
      return getLicensedSdk(provider) !== null;
    },
    sdk() {
      return getLicensedSdk(provider);
    },
  };
}

export const PrimeVideoIntegration = createIntegration("prime");
export const NetflixIntegration = createIntegration("netflix");
export const DisneyPlusIntegration = createIntegration("disney");

/** Adapter genérico para serviços que dependem de integração licenciada. */
export function createLicensedAdapter(
  integration: LicensedIntegration,
  container: HTMLElement | null,
  contentId: string | null,
): StreamingProviderAdapter {
  const provider = integration.provider;
  const label = PROVIDER_LABEL[provider];
  let sdk: LicensedPlaybackSdk | null = null;

  return {
    provider,
    get playable() {
      return sdk !== null;
    },
    unavailableMessage:
      "Este serviço requer uma integração oficial de reprodução para funcionar dentro do Vibely.",
    requirement: LICENSED_REQUIREMENT[provider] ?? `${label}: integração oficial de reprodução.`,
    async initialize() {
      const available = await integration.isAvailable();
      if (!available || !container) {
        sdk = null;
        return;
      }
      const official = integration.sdk();
      if (!official) {
        sdk = null;
        return;
      }
      await official.mount(container, contentId);
      sdk = official;
    },
    async play() {
      await sdk?.play();
    },
    async pause() {
      await sdk?.pause();
    },
    async seek(seconds: number) {
      await sdk?.seek(seconds);
    },
    async getCurrentTime() {
      return (await sdk?.getCurrentTime()) ?? 0;
    },
    async getDuration() {
      return (await sdk?.getDuration()) ?? 0;
    },
    isPlaying() {
      return sdk?.isPlaying() ?? false;
    },
    async destroy() {
      await sdk?.unmount();
      sdk = null;
    },
  };
}

/** PrimeVideoProvider — experiência Prime Video dentro da área do player. */
export const PrimeVideoProvider = (c: HTMLElement | null, id: string | null) =>
  createLicensedAdapter(PrimeVideoIntegration, c, id);

/** NetflixProvider — experiência Netflix dentro da área do player. */
export const NetflixProvider = (c: HTMLElement | null, id: string | null) =>
  createLicensedAdapter(NetflixIntegration, c, id);

/** DisneyPlusProvider — experiência Disney+ dentro da área do player. */
export const DisneyPlusProvider = (c: HTMLElement | null, id: string | null) =>
  createLicensedAdapter(DisneyPlusIntegration, c, id);

// Nomes anteriores mantidos como aliases.
export const PrimeVideoAdapter = PrimeVideoProvider;
export const NetflixAdapter = NetflixProvider;
export const DisneyPlusAdapter = DisneyPlusProvider;
